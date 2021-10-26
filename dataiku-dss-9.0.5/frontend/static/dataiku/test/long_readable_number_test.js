describe("longReadableNumber filter", function(){
    beforeEach(module("dataiku.charts"));
    beforeEach(module("dataiku.mock"));

    it("can use short space separators", function() {
        inject(function(longReadableNumberFilter) {
            var formatter = longReadableNumberFilter;
            expect(formatter(1234)).toEqual("1\xa0234");
        });
    });

    it("rounds and formats numbers when the range is big enough", function(){
        inject(function(longReadableNumberFilter) {
            var formatter = longReadableNumberFilter;
            expect(formatter(12341234.12341234)).toEqual("12\xa0341\xa0234.12");
            expect(formatter(2341234.12341234)).toEqual("2\xa0341\xa0234.12");
            expect(formatter(341234.12341234)).toEqual("341\xa0234.123");
            expect(formatter(41234.12341234)).toEqual("41\xa0234.1234");
            expect(formatter(1234.12341234)).toEqual("1\xa0234.12341");
            expect(formatter(234.12341234)).toEqual("234.123412");
            expect(formatter(34.12341234)).toEqual("34.1234123");
            expect(formatter(4.12341234)).toEqual("4.12341234");
        });
    });

    it("does not leave trailing zeros", function(){
        inject(function(longReadableNumberFilter) {
            var formatter = longReadableNumberFilter;
            expect(formatter(0.0001)).toEqual("0.0001");
            expect(formatter(0.01)).toEqual("0.01");
            expect(formatter(1.01)).toEqual("1.01");
            expect(formatter(1.0001)).toEqual("1.0001");
            expect(formatter(1)).toEqual("1");
        });
    });

    it("Rounding with ridiculous amount of significative numbers", function(){
        inject(function(longReadableNumberFilter) {
            var formatter = longReadableNumberFilter;
            expect(formatter(500609.47690166264)).toEqual("500\xa0609.477"); //big
            expect(formatter(1000.0000999966372)).toEqual("1\xa0000.0001"); //bigish
            expect(formatter(1.0100000000017866)).toEqual("1.01"); //one_dot_o_dot_one
            expect(formatter(1.0001000000028477)).toEqual("1.0001"); //one-ish
            expect(formatter(0.0099999999163)).toEqual("0.01"); //small
            expect(formatter(0.000099999999983365)).toEqual("0.0001"); //super small
        });
    });

    it("returns string for non-numbers", function(){
        inject(function(longReadableNumberFilter) {
            var formatter = longReadableNumberFilter;
            let testFunction = function(){}; //NOSONAR Ok to pass empty function to check if it returns NA here
            expect(formatter(testFunction)).toEqual(testFunction.toString());
            let testObject = {};
            expect(formatter(testObject)).toEqual(testObject.toString());
            let testArray = ['a','b'];
            expect(formatter(testArray)).toEqual(testArray.toString());
        });
    });

    it("Transparent when not a number but a string", function(){
        inject(function(longReadableNumberFilter) {
            var formatter = longReadableNumberFilter;
            expect(formatter("abcde")).toEqual("abcde"); //string
        });
    });

    it("Format when input is a number stored as a string", function(){
        inject(function(longReadableNumberFilter) {
            var formatter = longReadableNumberFilter;
            expect(formatter("12341234.12341234")).toEqual("12\xa0341\xa0234.12");
            expect(formatter("0.0001")).toEqual("0.0001");
            expect(formatter("500609.47690166264")).toEqual("500\xa0609.477");
        });
    });
});
