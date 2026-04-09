import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from api.index import app

for rule in app.url_map.iter_rules():
    print(f"{rule.endpoint} -> {rule.rule}")
