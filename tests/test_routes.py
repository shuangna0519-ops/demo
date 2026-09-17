"""路由层用例：首页、/generate 入参校验、历史落库与展示。"""
import json
from contextlib import closing


def test_index_ok(client):
    resp = client.get('/')
    assert resp.status_code == 200
    assert 'AI 应用生成器'.encode('utf-8') in resp.data


def test_generate_empty_description_returns_400(client):
    resp = client.post('/generate', json={'description': '   '})
    assert resp.status_code == 400
    data = json.loads(resp.data)
    assert data['error'] == '请输入应用描述'


def test_generate_creates_history_record(client, app_module):
    resp = client.post('/generate', json={'description': '帮我做个计算器'})
    assert resp.status_code == 200
    data = resp.get_json()

    assert data['template_name'] == 'calculator'
    assert isinstance(data['id'], int)
    assert data['created_at']  # 由数据库 CURRENT_TIMESTAMP 生成
    assert '<' in data['html']  # 返回了模板 HTML

    # 直接查库，验证记录确实落库
    with closing(app_module.get_connection()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                'SELECT description, template_name FROM history WHERE id = %s',
                (data['id'],),
            )
            row = cur.fetchone()
    assert row == ('帮我做个计算器', 'calculator')


def test_history_listed_on_index_after_generate(client):
    client.post('/generate', json={'description': '一个待办清单'})
    resp = client.get('/')
    assert resp.status_code == 200
    assert '一个待办清单'.encode('utf-8') in resp.data
    assert 'todo'.encode('utf-8') in resp.data
