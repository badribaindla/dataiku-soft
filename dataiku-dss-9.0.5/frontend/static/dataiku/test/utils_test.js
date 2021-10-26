describe('convertSpecialChars', function () {
    it('returns null if string is null or undefined', function () {
        expect(convertSpecialChars(null)).toBeNull();
        expect(convertSpecialChars(undefined)).toBeNull();
    });
    it('returns string with no special chars as-is', function () {
        expect(convertSpecialChars('String with no special char')).toBe('String with no special char');
    });
    it('convert the tabulation string into the tabulation char', function () {
        expect(convertSpecialChars('\\t')).toBe('\t');
        expect(convertSpecialChars('\\t')).toBe('	');
    });
    it('returns tabulation char as-is', function () {
        expect(convertSpecialChars('\t')).toBe('\t');
    });
    it('converts multiple tabulation strings', function () {
        expect(convertSpecialChars('First tab:\\tand second tab:\\t.')).toBe('First tab:\tand second tab:\t.');
    });
    it('converts unicode string into corresponding character', function () {
        expect(convertSpecialChars('\\u266A')).toBe('♪');
        expect(convertSpecialChars('\u266A')).toBe('♪');
    });
    it('returns unicode char as-is', function () {
        expect(convertSpecialChars('♪')).toBe('♪');
    });
    it('converts unicode string with case insensitive into corresponding character', function () {
        expect(convertSpecialChars('\\u266a')).toBe('♪');
    });
    it('expects the  unicode string to be made of for digits', function () {
        expect(convertSpecialChars('\\u266')).toBe('\\u266');
    });
    it('converts multiple unicode strings and tabulation strings', function () {
        expect(convertSpecialChars( '1st unicode: \\u2776 a tabulation\\t.\\n2nd unicode: \u2777 and tabulation\\t.'))
            .toBe('1st unicode: ❶ a tabulation\t.\\n2nd unicode: ❷ and tabulation\t.');
    });
});