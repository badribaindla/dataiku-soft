describe("DKUSQLFormatter", function(){
    beforeEach(module("dataiku.recipes"));

    var format;
    beforeEach(inject(function(DKUSQLFormatter) {
        format = (sql) => DKUSQLFormatter.format(sql, 4);
    }));

    it('works on simple query', function() {
        expect(format('SELECT 1 FROM toto')).toEqual([
            'SELECT',
            '    1',
            'FROM',
            '    toto',
            ''
        ].join('\n'));
    });

    it('works on query with expansions', function() {
        expect(format('SELECT 1 FROM ${projectKey}_table WHERE ${condition}')).toEqual([
            'SELECT',
            '    1',
            'FROM',
            '    ${projectKey}_table',
            'WHERE',
            '    ${condition}',
            ''
        ].join('\n'));
    });

    it('works on query with variable expansions containing special characters', function() {
        expect(format('SELECT 1 FROM ${thisIs!{Unsu@l😭😭😭}_table WHERE ${condition}')).toEqual([
            'SELECT',
            '    1',
            'FROM',
            '    ${thisIs!{Unsu@l😭😭😭}_table',
            'WHERE',
            '    ${condition}',
            ''
        ].join('\n'));
    });
});
