describe("Sorting service", function(){
	beforeEach(module('dataiku.services'));
	beforeEach(module('dataiku.common.func'));
    beforeEach(module('dataiku.mock'));


    it("simple sort", function(){
        inject(function(CollectionFiltering) {
            var f = CollectionFiltering.filter;
        	var p = {}
        	var collection = [{
        		a:'aa',
        		b:{c:'1'}
        	},{
        		a:'aa',
        		b:{c:'2'}
        	},{
        		a:'bb',
        		b:{c:'1',d:34}
        	},{
        		a:'cc',
        		b:{e:90809}
        	},{
        		a:'dd',
        		b:{c:'1'}
        	},{
        		b:{c:'1',e:'ee'}
        	}];
            expect(f(collection,{
        		a:'aa',
        		b:{c:'1'}
        	},p)).toEqual([{
        		a:'aa',
        		b:{c:'1'}
        	}]);

    	    expect(f(collection,{
    			a:'aa'
    		},p)).toEqual([{
    			a:'aa',
    			b:{c:'1'}
    		},{
        		a:'aa',
        		b:{c:'2'}
        	}]);
        });
    });

    it("user sort", function(){
        inject(function(CollectionFiltering) {
            var f = CollectionFiltering.filter;
        	var p = {
        		userQueryTargets:['a','b.c'],
        		propertyRules:{aa:'a',qq:'e.f'}
        	};
        	var collection = [{
        		a:'aa',
        		b:{c:'1'}
        	},{
        		a:'aa',
        		b:{c:2}
        	},{
        		a:'bb',
        		b:{c:'1',d:34}
        	},{
        		a:'cc',
        		b:{e:90809}
        	},{
        		a:'dd',
        		b:{c:'1'}
        	},{
        		b:{c:'1',e:'ee'}
        	}
        	];
            expect(f(collection,
            {
        		userQuery:'not:1',
        	},p)).toEqual([
        	{
        		a:'aa',
        		b:{c:2}
        	},{
        		a:'cc',
        		b:{e:90809}
        	}
        	]);

        	expect(f(collection,
            {
        		userQuery:'1 aa',
        	},p)).toEqual([
        	{
        		a:'aa',
        		b:{c:'1'}
        	}
        	]);


        });
    });

    it("tag sort", function(){
        inject(function(CollectionFiltering) {
            var f = CollectionFiltering.filter;
        	var p = {}
        	var collection = [
        	{
        		a:'aa',
        		b:{c:1}
        	},{
        		a:'aa',
        		b:{c:2}
        	},{
        		a:'bb',
        		b:{c:1,d:34}
        	},{
        		a:'cc',
        		b:{e:90809}
        	},{
        		a:'dd',
        		b:{c:1}
        	},{
        		b:{c:1,e:'ee'}
        	}
        	];

            expect(f(collection,{
        		userQuery:'a:aa b.c:2',
        	},p)).toEqual([{
        		a:'aa',
        		b:{c:2}
        	}]);

            expect(f(collection,{
        		userQuery:'a:aa',
        	},p)).toEqual([
        	{
        		a:'aa',
        		b:{c:1}
        	},{
        		a:'aa',
        		b:{c:2}
        	}
        	]);

    	    expect(f(collection,{
    			userQuery:'-a:aa',
    		},p)).toEqual([
			{
        		a:'bb',
        		b:{c:1,d:34}
        	},{
        		a:'cc',
        		b:{e:90809}
        	},{
        		a:'dd',
        		b:{c:1}
        	},{
        		b:{c:1,e:'ee'}
        	}
    		]);

    		expect(f(collection,{
    			userQuery:'-a:aa b.e:90809',
    		},p)).toEqual([
        	{
        		a:'cc',
        		b:{e:90809}
        	}
    		]);
        });
    });

    it("Regex sort", function(){
        inject(function(CollectionFiltering) {
            var f = CollectionFiltering.filter;
        	var p = {
        		userQueryTargets:['a','b.c'],
        		propertyRules:{aa:'a',qq:'b.e'}
        	}
        	var collection = [
        	{
        		a:'this is a long string',
        		b:{c:1}
        	},{
        		a:'this is another very long string',
        		b:{c:2}
        	},{
        		a:'this is a very long string',
        		b:{c:1,d:34}
        	},{
        		a:'v12345',
        		b:{e:90809}
        	},{
        		a:'v1234',
        		b:{c:1}
        	},{
        		b:{c:1,e:'this is a long string'}
        	}
        	];

            expect(f(collection,{
        		userQuery:'a:/this.*very/',
        	},p)).toEqual([{
        		a:'this is another very long string',
        		b:{c:2}
        	},{
        		a:'this is a very long string',
        		b:{c:1,d:34}
        	}]);

            expect(f(collection,{
        		userQuery:'-a:/this.*very/',
        	},p)).toEqual([        	{
        		a:'this is a long string',
        		b:{c:1}
        	},{
        		a:'v12345',
        		b:{e:90809}
        	},{
        		a:'v1234',
        		b:{c:1}
        	},{
        		b:{c:1,e:'this is a long string'}
        	}]);

    	    expect(f(collection,{
    			userQuery:'-a:/this.*very/ qq:long',
    		},p)).toEqual([{
    			b:{c:1,e:'this is a long string'}
    		}]);

        	expect(f(collection,{
        		userQuery:'/this.*very/',
        	},p)).toEqual([{
        		a:'this is another very long string',
        		b:{c:2}
        	},{
        		a:'this is a very long string',
        		b:{c:1,d:34}
        	}]);

        });
    });

    it("Dumb sort", function(){
        inject(function(CollectionFiltering) {
            var f = CollectionFiltering.filter;
        	var p = {
        		userQueryTargets:['a','b.c'],
        		propertyRules:{aa:'a',qq:'b.e'}
        	}
        	var collection = [
        	{
        		a:'this is a long string',
        		b:{c:1}
        	},{
        		a:'this is another very long string',
        		b:{c:2}
        	},{
        		a:'this is a very long string',
        		b:{c:1,d:34}
        	},{
        		a:'v12345',
        		b:{e:90809}
        	},{
        		a:'v1234',
        		b:{c:1}
        	},{
        		b:{c:1,e:'this is a long string'}
        	}
        	];

            expect(f(collection,{
        		userQuery:'/NothingTHERETOBESEEN/',
        	},p)).toEqual([]);

            expect(f(collection,{
        		userQuery:'nothing:/+/',
        	},p)).toEqual([]);

            expect(f([],{
        		userQuery:'nothing:/+/',
        	},p)).toEqual([]);

        });
    });

})