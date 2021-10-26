// import the Estimator from a provided jar, which must be placed in lib/java 
import com.mycompany.classification.MyClassificationModel

// instantiate the Estimator
new MyClassificationModel()
  .setFeaturesCol("__dku_features") // Must always be __dku_features
  .setLabelCol("REPLACE_WITH_TARGET") // Replace with the target column
  .setPredictionCol("prediction") // Must always be prediction
  .setSomeCustomParameter("some_value")

