// import the Estimator from spark.ml
import org.apache.spark.ml.regression.RandomForestRegressor

// instantiate the Estimator
new RandomForestRegressor()
  .setLabelCol("REPLACE_WITH_TARGET") // Replace with the correct column
  .setFeaturesCol("__dku_features") // Must always be __dku_features
  .setPredictionCol("prediction") // Must always be prediction
  .setNumTrees(50)
  .setMaxDepth(8)

