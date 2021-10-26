library(shiny)
# WARNING! Leaflet R package is not installed by default with DSS
# You'll need to install the package. We recommend that you use a
# dedicated code environment for this.
library(leaflet)

shinyUI(fluidPage(

  titlePanel("Geo analysis in project ${projectKey}"),

  helpText("A short legend"),

  # This panel will be populated according to the code in the "Server" tab
  leafletOutput("mymap"),

  helpText("For better communication, all insights should have a small explanation.")
))