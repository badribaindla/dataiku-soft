describe("number formatter", function(){
    beforeEach(module("dataiku.charts"));
    beforeEach(module("dataiku.mock"));

    it("can use coma separators", function() {
        inject(function(NumberFormatter) {
            var formatter = NumberFormatter.get(0, 20000, 10);
            expect(formatter(1234)).toEqual("1234");

            var formatter = NumberFormatter.get(0, 20000, 10, true);
            expect(formatter(1234)).toEqual("1,234");
        });
    });

    it("returns NA for non-numbers", function(){
        inject(function(NumberFormatter) {
            var formatter = NumberFormatter.get(1, 2, 3);
            expect(formatter("couscous", "NA"));
            expect(formatter(function(){}, "NA"));
            expect(formatter({}, "NA"));
        });
    });

    it("rounds and formats numbers when the range is big enough", function(){
        inject(function(NumberFormatter) {
            var formatter = NumberFormatter.get(0, 200000, 10);
            expect(formatter(152000.0052)).toEqual("152k");
            expect(formatter(105.2)).toEqual("105");

            formatter = NumberFormatter.get(0, 999, 10);
            expect(formatter(12.7897)).toEqual("13");
            expect(formatter(1.554)).toEqual("2");
            expect(formatter(0)).toEqual("0");
        });
    });

    it("doesn't round numbers if the range is too small", function(){
        inject(function(NumberFormatter) {
            var formatter = NumberFormatter.get(0, 1, 2);
            expect(formatter(0.5123)).toEqual("0.5");

            formatter = NumberFormatter.get(0.0001, 0.0002, 10);
            expect(formatter(0.000153)).toEqual("0.00015");

            formatter = NumberFormatter.get(150000, 150000.01, 20, true);
            expect(formatter(150000.005236)).toEqual("150,000.0052");

            formatter = NumberFormatter.get(10000, 10001, 5, true);
            expect(formatter(1000.55555)).toEqual("1,000.6");
        });
    });

    it("shows enough significant figures in scientific notation", function() {
        inject(function(NumberFormatter) {
            var formatter = NumberFormatter.get(0, 1, 10);             // No need for precision
            expect(formatter(0.0000001)).toEqual("1e-7");

            formatter = NumberFormatter.get(0, 0.0000001, 100);        // Need to keep more significant figures
            expect(formatter(0.0000001111)).toEqual("1.11e-7");
        });
    });

    it("works with min = max", function() {
        inject(function(NumberFormatter) {
            var formatter = NumberFormatter.get(12, 12, 10);
            expect(formatter(12)).toEqual("12");
        });
    });

    it("has no rounding error", function() {
        inject(function(NumberFormatter) {
            var formatter = NumberFormatter.get(44800, 1068548, 10);
            expect(formatter(200000)).toEqual("200k");
        });
    });
});
