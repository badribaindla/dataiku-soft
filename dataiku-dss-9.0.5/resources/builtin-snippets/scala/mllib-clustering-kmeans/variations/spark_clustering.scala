// import the Estimator from spark.ml
import org.apache.spark.ml.clustering.KMeans

// instantiate the Estimator
new KMeans()
  .setFeaturesCol("__dku_features") // Must always be __dku_features
  .setK(5)
  .setPredictionCol("cluster") // Must always be cluster
