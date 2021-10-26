describe("partition deps", function(){
	beforeEach(module("dataiku.charts"));
	beforeEach(module('dataiku.recipes'));
	beforeEach(module("dataiku.mock"));

	it("has proper constants", function(){
		inject(function(PartitionDeps) {
			expect(PartitionDeps.timeRangeFromModes).toBeDefined();
			expect(PartitionDeps.timeRangeFromModes.length).toBe(2);
		});
	});

	it ("can autocomplete time range 1", inject(function(PartitionDeps) {
		var pdep = { "func" : "time_range" }
		var odims = [{"out" : "ds1", "odim" : "day" }]
		PartitionDeps.autocomplete(pdep, odims);
		expect(pdep.params.fromMode).toBe("RELATIVE_OFFSET")
	}));

	it ("can serialize", inject(function(PartitionDeps) {
		var pdep = { "func" : "equals", "idim": "d1", "input":"da1",
		  "$$output" : {"out" : "dataset2", "odim" : "x" } }

		var ret = PartitionDeps.prepareForSerialize(pdep);
		expect(ret.odim).toBe("x")
		expect(ret.out).toBe("dataset2")
	}));

	it ("can serialize 2", inject(function(PartitionDeps) {
		var pdep = { "func" : "time_range", "idim": "d1", "input":"da1",
		  "$$output" : {"label": "current time" } }

		var ret = PartitionDeps.prepareForSerialize(pdep);
		expect(ret.odim).toBeUndefined();
		expect(ret.out).toBeUndefined();
	}));
})