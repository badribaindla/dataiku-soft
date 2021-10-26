// import the Estimator from a provided jar, which must be placed in lib/java 
import com.mycompany.regression.MyCustomRegression

// instantiate the Estimator
new MyCustomRegression()
  .setLabelCol("REPLACE_WITH_TARGET") // Replace with the target column
  .setFeaturesCol("__dku_features") // Must always be __dku_features
  .setPredictionCol("prediction") // Must always be prediction
  .setSomeCustomParameter("some_value")

