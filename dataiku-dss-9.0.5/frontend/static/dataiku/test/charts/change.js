describe("chart change type tests", function(){
	beforeEach(module("dataiku.charts"));
	beforeEach(module("dataiku.directives.simple_report"));
	beforeEach(module("dataiku.mock"));

	function makeEmpty() {
		var chartSpec = {
			genericDimension0 : [],
			genericDimension1 : [],
			xDimension : [],
			yDimension : [],
			groupDimension: [],
			genericMeasures : [],
			uaSize : [],
			uaColor: [],
			uaShape: [],
			sizeMeasure : [],
			colorMeasure : [],
			tooltipMeasures : [],
		}
		return chartSpec
	}

	function make1D2MStackedColumns() {
		var chartSpec = makeEmpty();
		chartSpec.genericDimension0 = [{ column: "dcol0", type : "ALPHANUM", isA : "dimension"}];
		chartSpec.genericMeasures = [
			{ column: "dmes0", type : "NUMERIC", "function" : "AVG"},
			{ column: "dmes1", type : "NUMERIC", "function" : "AVG"}
		];
		chartSpec.uaTooltip = [];
		chartSpec.boxplotValue = [];
		chartSpec.uaXDimension = [];
		chartSpec.uaYDimension = [];
		chartSpec.animationDimension = [];
		chartSpec.facetDimension = [];
		return chartSpec;
	}

	it("can change std to std", function(){
		inject(function(ChartChangeHandler) {
			var chartSpec = make1D2MStackedColumns();
			var csOrig = angular.copy(chartSpec);

			ChartChangeHandler.onChartTypeChange(chartSpec, "stacked_area", "STANDARD");
			expect(chartSpec.genericDimension0).toEqual(csOrig.genericDimension0);
			expect(chartSpec.genericMeasures).toEqual(csOrig.genericMeasures);
		});
	});

	it("can change std to scatter", function(){
		inject(function(ChartChangeHandler) {
			var chartSpec = make1D2MStackedColumns();
			var csOrig = angular.copy(chartSpec);

			ChartChangeHandler.onChartTypeChange(chartSpec, "scatter", "STANDARD");
			expect(chartSpec.uaXDimension).toEqual(csOrig.genericDimension0);
			expect(chartSpec.uaYDimension).toEqual([]);
		});
	});

	it("can change weird mixed to scatter", function(){
		inject(function(ChartChangeHandler) {
			var chartSpec = make1D2MStackedColumns();
			chartSpec.xDimension = [{column : "xcol0", type:"ALPHANUM"}]
			var csOrig = angular.copy(chartSpec);

			ChartChangeHandler.onChartTypeChange(chartSpec, "scatter", "STANDARD");
			expect(chartSpec.uaXDimension).toEqual(csOrig.genericDimension0);
			expect(chartSpec.uaYDimension).toEqual(csOrig.xDimension);
		});
	});
})