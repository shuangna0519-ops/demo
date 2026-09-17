import os
import datetime
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
from flask import Flask, render_template, request, jsonify, Response

app = Flask(__name__)


@app.after_request
def add_no_cache_headers(response):
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, '.env'))
DATABASE_URL = os.environ.get('DATABASE_URL', '')
APP_TEMPLATE_DIR = os.path.join(BASE_DIR, 'app_templates')


def get_connection():
    if not DATABASE_URL:
        raise RuntimeError('环境变量 DATABASE_URL 未设置')
    return psycopg2.connect(DATABASE_URL)

# 关键词 -> 模板名称 映射（按优先级排列）
TEMPLATE_MATCHERS = {
    'todo': ['待办', 'todo', '任务', '清单', '提醒', '日程'],
    'weather': ['天气', 'weather', '气温', '温度', '降雨', '预报'],
    'clock': ['时钟', 'clock', '时间', '钟表', '计时', '秒表'],
    'calculator': ['计算器', 'calculator', '计算', '算数', 'math', '数学'],
}


def init_db():
    conn = get_connection()
    cur = conn.cursor()
    cur.execute('''
        CREATE TABLE IF NOT EXISTS history (
            id SERIAL PRIMARY KEY,
            description TEXT NOT NULL,
            template_name TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    ''')
    conn.commit()
    cur.close()
    conn.close()


def match_template(description):
    desc_lower = description.lower()
    for template_name, keywords in TEMPLATE_MATCHERS.items():
        for kw in keywords:
            if kw.lower() in desc_lower:
                return template_name
    return 'default'


def load_template_html(template_name):
    path = os.path.join(APP_TEMPLATE_DIR, f'{template_name}.html')
    if not os.path.exists(path):
        path = os.path.join(APP_TEMPLATE_DIR, 'default.html')
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()


# 预览工具会注入 Vite HMR 客户端脚本，提供空响应避免 404 导致页面加载中止
@app.route('/@vite/client')
def vite_client():
    return Response('// vite client stub for preview compatibility\n', mimetype='application/javascript')


@app.route('/')
def index():
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute('SELECT * FROM history ORDER BY created_at DESC')
    rows = cur.fetchall()
    cur.close()
    conn.close()
    history = [dict(r) for r in rows]
    return render_template('index.html', history=history)


@app.route('/generate', methods=['POST'])
def generate():
    data = request.get_json() or {}
    description = (data.get('description') or '').strip()
    if not description:
        return jsonify({'error': '请输入应用描述'}), 400

    template_name = match_template(description)
    html = load_template_html(template_name)
    created_at = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        'INSERT INTO history (description, template_name, created_at) VALUES (%s, %s, %s) RETURNING id',
        (description, template_name, created_at),
    )
    new_id = cur.fetchone()[0]
    conn.commit()
    cur.close()
    conn.close()

    return jsonify({
        'id': new_id,
        'description': description,
        'template_name': template_name,
        'created_at': created_at,
        'html': html,
    })


if __name__ == '__main__':
    init_db()
    host = os.environ.get('HOST', '0.0.0.0')
    port = int(os.environ.get('PORT', 8080))
    from waitress import serve
    print(f'Serving on http://{host}:{port} (waitress)')
    serve(app, host=host, port=port)
