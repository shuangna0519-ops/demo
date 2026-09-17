import os
import datetime
from contextlib import closing
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
    with closing(get_connection()) as conn:
        with conn.cursor() as cur:
            cur.execute('''
                CREATE TABLE IF NOT EXISTS history (
                    id SERIAL PRIMARY KEY,
                    description TEXT NOT NULL,
                    template_name TEXT NOT NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            # 兼容旧库：把 TEXT 类型的 created_at 平滑迁移到 TIMESTAMP
            cur.execute(
                "SELECT data_type FROM information_schema.columns "
                "WHERE table_name = 'history' AND column_name = 'created_at'"
            )
            col_type = cur.fetchone()
            if col_type and col_type[0] != 'timestamp without time zone':
                cur.execute(
                    'ALTER TABLE history ALTER COLUMN created_at '
                    'TYPE TIMESTAMP USING created_at::timestamp'
                )
                cur.execute(
                    'ALTER TABLE history ALTER COLUMN created_at '
                    'SET DEFAULT CURRENT_TIMESTAMP'
                )
        conn.commit()


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
    with closing(get_connection()) as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                'SELECT id, description, template_name, created_at '
                'FROM history ORDER BY created_at DESC, id DESC'
            )
            rows = cur.fetchall()
    history = []
    for r in rows:
        item = dict(r)
        if isinstance(item['created_at'], datetime.datetime):
            item['created_at'] = item['created_at'].strftime('%Y-%m-%d %H:%M:%S')
        history.append(item)
    return render_template('index.html', history=history)


@app.route('/generate', methods=['POST'])
def generate():
    data = request.get_json() or {}
    description = (data.get('description') or '').strip()
    if not description:
        return jsonify({'error': '请输入应用描述'}), 400

    template_name = match_template(description)
    html = load_template_html(template_name)

    with closing(get_connection()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                'INSERT INTO history (description, template_name) '
                'VALUES (%s, %s) RETURNING id, created_at',
                (description, template_name),
            )
            row = cur.fetchone()
        conn.commit()

    assert row is not None, 'INSERT 未返回记录'
    new_id, created_at_value = row
    if isinstance(created_at_value, datetime.datetime):
        created_at = created_at_value.strftime('%Y-%m-%d %H:%M:%S')
    else:
        created_at = str(created_at_value)

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
