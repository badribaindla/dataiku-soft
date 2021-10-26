describe("func lib", function(){
	beforeEach(module('dataiku.common.func'));

    it("updateNoDereference", function(){
        inject(function(Collections) {
            var f = Collections.updateNoDereference;
            expect(f([],[1,2,3,4]))
                .toEqual([1,2,3,4]);
            expect(f([1,2],[1,2,3,4]))
                .toEqual([1,2,3,4]);
            expect(f([1,2,3,4],[]))
                .toEqual([]);
            expect(f([],[]))
                .toEqual([]);
            expect(f({},{'a':1,'b':2}))
                .toEqual({'a':1,'b':2});
            expect(f({'a':1,'b':2},{}))
                .toEqual({});
            expect(f({},{}))
                .toEqual({});
            expect(f(undefined,{'a':1,'b':2}))
                .toEqual({'a':1,'b':2});
            expect(f(null,{'a':1,'b':2}))
                .toEqual({'a':1,'b':2});
            expect(f(22,{'a':1,'b':2}))
                .toEqual({'a':1,'b':2});
			expect(f( [{k:1,a:12}, null, {}, 0,{k:4,a:4},{k:5,a:5}],
            		  [{k:1,a:1},{k:2,a:2},{k:3,a:3},{k:4,a:4}]      ))
                .toEqual([{k:1,a:1},{k:2,a:2},{k:3,a:3},{k:4,a:4}]);
			var o = [{k:1,a:12}, null, {}, 0,{k:4,a:4},{k:5,a:5}] ;
			var d = [{k:1,a:1},{k:2,a:2},{k:3,a:3},{k:4,a:4}];
			expect(f({a:o},{a:d}))
                .toEqual({a:d});
			expect(f({a:{a:o}},{a:{a:d}}))
                .toEqual({a:{a:d}});
        });
    });

    it("updateArrayBasedOn", function(){
        inject(function(Collections) {
            var f = Collections.updateArrayBasedOn;
            expect(f( [],[{k:1},{k:2},{k:3},{k:4}]     ,'k'))
                .toEqual([{k:1},{k:2},{k:3},{k:4}]);
            expect(f( [{k:1},{k:2},{k:3},{k:4}],[]     ,'k'))
                .toEqual([]);
            expect(f( [],[]            ,'k'))
                .toEqual([]);
            expect(f( undefined,[{k:1},{k:2},{k:3},{k:4}]     ,'k'))
                .toEqual([{k:1},{k:2},{k:3},{k:4}]);
            expect(f( null,[{k:1},{k:2},{k:3},{k:4}]     ,'k'))
                .toEqual([{k:1},{k:2},{k:3},{k:4}]);
            expect(f( [{k:1,a:1},{k:2,a:2},{k:3,a:3},{k:4,a:4}],[]     ,'k'))
                .toEqual([]);
            expect(f( [{k:1,a:12},{k:4,a:4}],
            		  [{k:1,a:1},{k:2,a:2},{k:3,a:3},{k:4,a:4}]        ,'k'))
                .toEqual([{k:1,a:1},{k:4,a:4},{k:2,a:2},{k:3,a:3}]);
            expect(f( [{k:1,a:12},{k:4,a:4},{k:5,a:5}],
            		  [{k:1,a:1},{k:2,a:2},{k:3,a:3},{k:4,a:4}]        ,'k'))
                .toEqual([{k:1,a:1},{k:4,a:4},{k:2,a:2},{k:3,a:3}]);
            expect(f( [{k:1,a:12},{k:4,a:4},{k:5,a:5}],
            		  [{k:1,a:1},{k:2,a:2},{k:3,a:3},{k:4,a:4}]        ,'k'))
                .toEqual([{k:1,a:1},{k:4,a:4},{k:2,a:2},{k:3,a:3}]);
			expect(f( [{k:1,a:12}, null, {}, 0,{k:4,a:4},{k:5,a:5}],
            		  [{k:1,a:1},{k:2,a:2},{k:3,a:3},{k:4,a:4}]        ,'k'))
                .toEqual([{k:1,a:1},{k:4,a:4},{k:2,a:2},{k:3,a:3}]);

        });
    });

})