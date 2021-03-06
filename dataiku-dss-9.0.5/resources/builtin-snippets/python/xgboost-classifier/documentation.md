##### General Parameters
* booster [default=gbtree]
  which booster to use, can be gbtree or gblinear. gbtree uses tree based model while gblinear uses linear function.
* silent [default=0]
  0 means printing running messages, 1 means silent mode.
* nthread [default to maximum number of threads available if not set]
  number of parallel threads used to run xgboost
* num_pbuffer [set automatically by xgboost, no need to be set by user]
  size of prediction buffer, normally set to number of training instances. The buffers are used to save the prediction results of last boosting step.
* num_feature [set automatically by xgboost, no need to be set by user]
  feature dimension used in boosting, set to maximum dimension of the feature

##### Parameters for Tree Booster
* eta [default=0.3]
  step size shrinkage used in update to prevents overfitting. After each boosting step, we can directly get the weights of new features. and eta actually shrinks the feature weights to make the boosting process more conservative.
  range: [0,1]
* gamma [default=0]
  minimum loss reduction required to make a further partition on a leaf node of the tree. the larger, the more conservative the algorithm will be.
  range: [0,∞]
* max_depth [default=6]
  maximum depth of a tree
  range: [1,∞]
* min_child_weight [default=1]
  minimum sum of instance weight(hessian) needed in a child. If the tree partition step results in a leaf node with the sum of instance weight less than min_child_weight, then the building process will give up further partitioning. In linear regression mode, this simply corresponds to minimum number of instances needed to be in each node. The larger, the more conservative the algorithm will be.
  range: [0,∞]
* max_delta_step [default=0]
  Maximum delta step we allow each tree's weight estimation to be. If the value is set to 0, it means there is no constraint. If it is set to a positive value, it can help making the update step more conservative. Usually this parameter is not needed, but it might help in logistic regression when class is extremely imbalanced. Set it to value of 1-10 might help control the update
  range: [0,∞]
* subsample [default=1]
  subsample ratio of the training instance. Setting it to 0.5 means that XGBoost randomly collected half of the data instances to grow trees and this will prevent overfitting.
  range: (0,1]
* colsample_bytree [default=1]
  subsample ratio of columns when constructing each tree.
  range: (0,1]
* lambda [default=1]
  L2 regularization term on weights
* alpha [default=0]
  L1 regularization term on weights

#### Parameters for Linear Booster
* lambda [default=0]
  L2 regularization term on weights
* alpha [default=0]
  L1 regularization term on weights
* lambda_bias
  L2 regularization term on bias, default 0(no L1 reg on bias because it is not important)