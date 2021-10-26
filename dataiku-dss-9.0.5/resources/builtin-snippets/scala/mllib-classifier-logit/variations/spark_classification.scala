// import the Estimator from spark.ml
import org.apache.spark.ml.classification.LogisticRegression

// instantiate the Estimator
new LogisticRegression()
  .setFeaturesCol("__dku_features") // Must always be __dku_features
  .setLabelCol("REPLACE_WITH_TARGET") //replace with the target column
  .setPredictionCol("prediction") // Must always be prediction
  .setMaxIter(10)
  .setRegParam(0.1)
  .setElasticNetParam(1.0)

