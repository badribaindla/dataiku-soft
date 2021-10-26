describe("boldifyFilter", function(){
    beforeEach(module("dataiku.filters"));

    let boldify;
    beforeEach(inject(function(boldifyFilter) {
        boldify = (text, patterns) => boldifyFilter(text, patterns);
    }));

    it('no pattern', function() {
        expect(boldify('bonjour')).toEqual('bonjour');
    });

    it('html entities', function() {
        expect(boldify('5 < 4 > 2')).toEqual('5 &lt; 4 &gt; 2');
    });

    it('match on special html characters', function() {
        expect(boldify('blo<bla>bli',['a>'])).toEqual('blo&lt;bl<b>a&gt;</b>bli');
    });

    it('pattern == text', function() {
        expect(boldify('bonjour', ['bonjour'])).toEqual('<b>bonjour</b>');
    });

    it('two patterns', function() {
        expect(boldify('bonjour', ['bo', 'ou'])).toEqual('<b>bo</b>nj<b>ou</b>r');
    });

    it('regex pattern', function() {
        expect(boldify('bonjour', [/j..r/])).toEqual('bon<b>jour</b>');
    });
});
