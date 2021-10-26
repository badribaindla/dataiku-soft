(function() {

    function getAllColors(palette) {
        var colors = [];
        for (var i = 3; i++;) {
            if (palette[i]) {
                colors = palette[i];
            } else {
                return colors;
            }
        }
    }

    setTimeout(function() {
        for (var key in colorbrewer) {
            var palette = colorbrewer[key];
            palette.colors = getAllColors(palette);
            palette[2] = [palette[3][0], palette[3][2]];
            palette.category = 'ColorBrewer';
            palette.id = key === 'Spectral' ? 'default' : key;
            palette.name = key;

            switch (palette.properties.type) {
                case 'qual':
                    dkuColorPalettes.addDiscrete(palette);
                    break;
                case 'seq':
                    dkuColorPalettes.addContinuous(palette);
                    break;
                case 'div':
                    dkuColorPalettes.addDiverging(palette);
                    break;
            }
        }
    }, 0);

})();