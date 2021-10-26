library(shiny)
library(dataiku)

myGeoDataset <- dkuReadDataset("REPLACE_WITH_YOUR_DATASET_NAME", samplingMethod="head", nbRows=1000)

shinyServer(function(input, output) {

  output$mymap <- renderLeaflet({
    leaflet(data = myGeoDataset) %>%
      addProviderTiles(providers$Stamen.TonerLite,
        options = providerTileOptions(noWrap = TRUE)
      ) %>%
      # Change "longitude" and "latitude"
      # for your corresponding column names if necessary:
      addMarkers(~longitude, ~latitude)
  })
})