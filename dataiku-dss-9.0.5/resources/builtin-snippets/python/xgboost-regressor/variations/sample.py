"XGBoost"

import xgboost as xgb
clf =  xgb.XGBRegressor(
    gamma=0,
    max_depth=6,
    min_child_weight=1
    )