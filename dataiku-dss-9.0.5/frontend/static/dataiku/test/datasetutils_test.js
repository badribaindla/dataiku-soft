describe("dataset utils", function(){
	beforeEach(module("dataiku.services"));
	beforeEach(module("dataiku.recipes"));
	beforeEach(module("dataiku.mock"));

	it ("resolves smart 1", inject(function(DatasetUtils) {
		var ret = DatasetUtils.getLocFromSmart("P1", "d1");
		expect(ret.name).toBe("d1");
		expect(ret.projectKey).toBe("P1");
		expect(ret.fullName).toBe("P1.d1");
	}));
	it ("resolves smart 2", inject(function(DatasetUtils) {
		var ret = DatasetUtils.getLocFromSmart("P1", "P1.d1");
		expect(ret.name).toBe("d1");
		expect(ret.projectKey).toBe("P1");
		expect(ret.fullName).toBe("P1.d1");
	}));
	it ("resolves smart 3", inject(function(DatasetUtils) {
		var ret = DatasetUtils.getLocFromSmart("P1", "P2.d1");
		expect(ret.name).toBe("d1");
		expect(ret.projectKey).toBe("P2");
		expect(ret.fullName).toBe("P2.d1");
	}));
	it ("resolves full", inject(function(DatasetUtils) {
		var ret = DatasetUtils.getLocFromFull("P1.d1");
		expect(ret.name).toBe("d1");
		expect(ret.projectKey).toBe("P1");
		expect(ret.fullName).toBe("P1.d1");
	}));

})