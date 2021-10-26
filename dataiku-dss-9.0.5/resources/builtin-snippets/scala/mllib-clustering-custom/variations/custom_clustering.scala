// import the Estimator from a provided jar, which must be placed in lib/java 
import com.mycompany.clustering.MyClusteringModel

// instantiate the Estimator
new MyClusteringModel()
  .setFeaturesCol("__dku_features") // Must always be __dku_features
  .setMyNumberOfClusters(5)
  .setPredictionCol("cluster") // Must always be cluster
  .setSomeCustomParameter("some_value")