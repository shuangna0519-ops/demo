"""pytest 公共夹具。

测试使用独立的 demo_test 数据库，与开发用的 demo 库隔离：
- 从 .env / 环境变量里的 DATABASE_URL 推导连接信息，仅把库名换成 demo_test；
- 自动连接 postgres 维护库创建 demo_test（已存在则跳过）；
- PostgreSQL 不可用时，数据库相关用例自动 skip，而不是报错。
"""
import os
from contextlib import closing
from pathlib import Path
from urllib.parse import urlparse, urlunparse

import pytest
import psycopg2
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / '.env')

_SOURCE_URL = os.environ.get('DATABASE_URL', 'postgresql://postgres@127.0.0.1:5432/demo')
_parsed = urlparse(_SOURCE_URL)
# 测试库 / 维护库（postgres）连接串，保留账号密码与主机端口
TEST_DATABASE_URL = urlunparse(('postgresql', _parsed.netloc, '/demo_test', '', '', ''))
_MAINT_URL = urlunparse(('postgresql', _parsed.netloc, '/postgres', '', '', ''))

# 必须在 import app 之前指向测试库；load_dotenv 默认不覆盖已存在的环境变量
os.environ['DATABASE_URL'] = TEST_DATABASE_URL


def _ensure_test_database():
    """连接维护库创建 demo_test，已存在则忽略。"""
    with closing(psycopg2.connect(_MAINT_URL)) as conn:
        conn.autocommit = True
        with conn.cursor() as cur:
            try:
                cur.execute('CREATE DATABASE demo_test')
            except psycopg2.Error as exc:
                if exc.pgcode != '42P04':  # duplicate_database
                    raise


@pytest.fixture(scope='session')
def app_module():
    try:
        _ensure_test_database()
    except psycopg2.OperationalError as exc:
        pytest.skip(f'PostgreSQL 不可用，跳过数据库相关测试：{exc}')

    import app as app_mod
    app_mod.DATABASE_URL = TEST_DATABASE_URL
    app_mod.init_db()
    return app_mod


@pytest.fixture
def client(app_module):
    """每个用例前清空 history 并重置自增序列，保证用例相互独立。"""
    with closing(psycopg2.connect(TEST_DATABASE_URL)) as conn:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute('TRUNCATE TABLE history RESTART IDENTITY')
    return app_module.app.test_client()
