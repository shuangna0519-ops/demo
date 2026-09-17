"""match_template 纯函数的边界与优先级用例（不依赖数据库）。"""
from app import match_template


def test_chinese_keyword_matches_todo():
    assert match_template('一个待办清单应用') == 'todo'


def test_english_keyword_case_insensitive():
    assert match_template('BUILD A TODO LIST') == 'todo'


def test_substring_keyword_matches_calculator():
    assert match_template('帮我做个计算器') == 'calculator'


def test_no_keyword_returns_default():
    assert match_template('随便写点什么都行') == 'default'


def test_priority_weather_before_clock():
    # 同时命中 weather(天气) 与 clock(时间/时钟) 时，
    # 按 TEMPLATE_MATCHERS 的注册顺序优先匹配 weather
    assert match_template('一个带时间的天气时钟') == 'weather'
