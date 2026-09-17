# AI 应用生成器 Demo

一个基于 Flask 的小应用：用户输入一段应用描述（如"一个待办清单"），系统按关键词匹配预设的 HTML 模板，页面右侧通过 iframe 即时展示可交互预览；所有生成记录存入 PostgreSQL，页面底部展示历史列表。界面使用 Bootstrap 5 风格。

## 功能特性

- 左侧输入应用描述，点击「生成应用」
- 右侧 iframe 实时渲染匹配到的 HTML 模板
- 关键词匹配：`todo`（待办）、`weather`（天气）、`clock`（时钟）、`calculator`（计算器），未命中时使用 `default` 通用模板
- 生成记录写入 PostgreSQL 的 `history` 表，首页底部展示历史（支持一键回填描述）
- 数据库连接串通过 `.env` 文件配置（python-dotenv），不硬编码

## 技术栈

- Python 3.10+
- Flask 3（Web 框架）
- psycopg2（PostgreSQL 驱动）
- python-dotenv（读取 `.env` 环境变量）
- waitress（生产级 WSGI 服务器，Windows 下直接 `python app.py` 即用）
- 原生 JavaScript + Bootstrap 5 风格样式（前端无构建步骤）

## 目录结构

```
demo/
├── app.py                 # Flask 应用入口（路由、数据库、模板匹配）
├── requirements.txt       # 运行依赖（~= 收窄版本）
├── requirements-dev.txt   # 开发/测试依赖（含 pytest）
├── pytest.ini             # pytest 配置
├── .env.example           # 环境变量模板（入库，供复制）
├── .env                   # 真实环境变量（不入库，需自行创建）
├── templates/             # Flask 页面模板
│   ├── base.html
│   └── index.html
├── app_templates/         # 预设的可交互 HTML 模板（iframe 预览用）
│   ├── default.html
│   ├── todo.html
│   ├── weather.html
│   ├── clock.html
│   └── calculator.html
└── tests/                 # pytest 用例
    ├── conftest.py        # 测试夹具（独立 demo_test 库、自动清表）
    ├── test_match_template.py
    └── test_routes.py
```

## 环境要求

- Python 3.10 或更高版本
- PostgreSQL 12 或更高版本（本地可访问即可）

## 快速开始

### 1. 获取代码并安装 Python 依赖

**Windows（PowerShell）：**

```powershell
git clone https://github.com/shuangna0519-ops/demo.git
cd demo
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

> 如果 PowerShell 提示执行策略禁止激活脚本，先执行一次：
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

**macOS / Linux：**

```bash
git clone https://github.com/shuangna0519-ops/demo.git
cd demo
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. 准备 PostgreSQL 数据库

确保本机（或某台可访问的主机）已安装并启动 PostgreSQL，然后创建一个数据库，名字随意（示例用 `demo`）：

```bash
# 方式一：命令行（默认超级用户 postgres）
createdb -U postgres demo

# 方式二：进 psql 执行 SQL
psql -U postgres
CREATE DATABASE demo;
```

> 表不用手动建——应用启动时会自动执行 `CREATE TABLE IF NOT EXISTS history (...)`。
> 表结构：`id`(自增主键)、`description`(文本)、`template_name`(文本)、`created_at`(`TIMESTAMP`，默认 `CURRENT_TIMESTAMP`)。
> 若从旧版本（`created_at` 为 TEXT）升级，启动时会自动把该列平滑迁移为 TIMESTAMP，已有数据不受影响。

### 3. 配置环境变量

复制模板文件并按实际情况修改：

**Windows：**

```powershell
Copy-Item .env.example .env
```

**macOS / Linux：**

```bash
cp .env.example .env
```

编辑 `.env`，填入你自己的 PostgreSQL 连接串：

```ini
# 本地 trust 认证、无密码：
DATABASE_URL=postgresql://postgres@127.0.0.1:5432/demo

# 有用户名密码的写法：
# DATABASE_URL=postgresql://用户名:密码@主机:5432/数据库名
```

### 4. 启动应用

```bash
python app.py
```

看到以下输出即启动成功：

```
Serving on http://127.0.0.1:8080 (waitress)
```

浏览器打开 <http://127.0.0.1:8080> 即可使用。

## 配置项说明（`.env`）

| 变量 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `DATABASE_URL` | 是 | 无 | PostgreSQL 连接串，格式 `postgresql://用户:密码@主机:端口/库名` |
| `HOST` | 否 | `0.0.0.0` | Web 服务监听地址 |
| `PORT` | 否 | `8080` | Web 服务监听端口 |

`.env` 已在 `.gitignore` 中忽略，不会提交到仓库，每个环境各自维护。

## 运行测试

```bash
pip install -r requirements-dev.txt   # 比运行依赖多一个 pytest
pytest
```

- 测试使用独立的 `demo_test` 数据库（首次运行自动创建），不会动开发用的 `demo` 库；每个用例执行前自动清空 `history` 表。
- 连接信息复用 `.env` 中的账号/主机，仅把库名替换为 `demo_test`。
- PostgreSQL 未启动时，数据库相关用例自动 skip，纯函数用例仍可运行。

## 接口清单

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/` | 首页（含预览区与历史列表） |
| POST | `/generate` | 提交描述，匹配模板并写入历史。请求体：`{"description": "一个待办清单"}`；返回：`id / description / template_name / created_at / html` |
| GET | `/@vite/client` | 预览工具兼容用的空脚本桩，可忽略 |

## 常见问题

**1. `psycopg2.OperationalError: connection to server ... port 5432 failed: Connection refused`**
PostgreSQL 没启动，或 `.env` 里的主机/端口不对。先确认数据库服务已运行（Windows 可在"服务"里查看，或用 `pg_isready -h 127.0.0.1 -p 5432` 检查）。

**2. `RuntimeError: 环境变量 DATABASE_URL 未设置`**
没有在项目根目录创建 `.env`，或 `.env` 里没写 `DATABASE_URL`。按上面第 3 步从 `.env.example` 复制一份。

**3. `ModuleNotFoundError: No module named 'psycopg2'`**
运行的不是虚拟环境里的 Python。确认命令行前缀有 `(.venv)`，并用 `python app.py` 启动；不要用其他 Python 安装的绝对路径去跑。

**4. Windows 下用 `pg_ctl start` 启动数据库后，在同一窗口按 Ctrl+C 把数据库也关了**
Windows 控制台的 Ctrl+C 会广播给同窗口的所有进程。请把数据库和应用放在**两个独立终端窗口**：一个窗口只负责 `pg_ctl start`（之后不要再在里面按 Ctrl+C），另一个窗口激活 venv 跑 `python app.py`（这个窗口可以随时 Ctrl+C 停应用）。更省心的做法是把 PostgreSQL 安装为 Windows 服务，随系统自启。

**5. 修改了 `.env` 不生效**
环境变量在进程启动时读取，改完后需要停止并重新运行 `python app.py`。

## 开发说明

- 新增预览模板：在 `app_templates/` 下放一个 `xxx.html`，并在 `app.py` 的 `TEMPLATE_MATCHERS` 中注册关键词即可。
- 数据库连接为每次请求新建、用完即关；仅用于演示，生产环境建议引入连接池。
