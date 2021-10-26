(function() {
    'use strict';

    /**
     * This file declares the builtin color palettes stored in window.dkuColorPalettes
     * Plugins can add their own palettes with window.dkuColorPalettes.addDiscrete, addContinuous & addDiverging
     */

    window.dkuColorPalettes = {
        continuous: [
            {
                id: "default",
                name: "Default",
                colors: ['#9999CC', '#00003c'],
                category: "Built-in palettes"
            },
            {
                id: "default_rev",
                name: "Default (rev)",
                colors: ['#00003c', '#9999CC'],
                category: "Built-in palettes"
            },
            {
                id: "ryg1",
                name: "Red-green",
                colors: ['#EA1111', '#EEEE11', '#11CA11'],
                category: "Built-in palettes"
            },
            {
                id: "gyr1",
                name: "Green-red",
                colors: ['#11CA11', '#EEEE11', '#EA1111'],
                category: "Built-in palettes"
            },
            {
                id: "viridis",
                name: "Viridis",
                colors: ["#440154","#440256","#450457","#450559","#46075a","#46085c","#460a5d","#460b5e","#470d60","#470e61","#471063","#471164","#471365","#481467","#481668","#481769","#48186a","#481a6c","#481b6d","#481c6e","#481d6f","#481f70","#482071","#482173","#482374","#482475","#482576","#482677","#482878","#482979","#472a7a","#472c7a","#472d7b","#472e7c","#472f7d","#46307e","#46327e","#46337f","#463480","#453581","#453781","#453882","#443983","#443a83","#443b84","#433d84","#433e85","#423f85","#424086","#424186","#414287","#414487","#404588","#404688","#3f4788","#3f4889","#3e4989","#3e4a89","#3e4c8a","#3d4d8a","#3d4e8a","#3c4f8a","#3c508b","#3b518b","#3b528b","#3a538b","#3a548c","#39558c","#39568c","#38588c","#38598c","#375a8c","#375b8d","#365c8d","#365d8d","#355e8d","#355f8d","#34608d","#34618d","#33628d","#33638d","#32648e","#32658e","#31668e","#31678e","#31688e","#30698e","#306a8e","#2f6b8e","#2f6c8e","#2e6d8e","#2e6e8e","#2e6f8e","#2d708e","#2d718e","#2c718e","#2c728e","#2c738e","#2b748e","#2b758e","#2a768e","#2a778e","#2a788e","#29798e","#297a8e","#297b8e","#287c8e","#287d8e","#277e8e","#277f8e","#27808e","#26818e","#26828e","#26828e","#25838e","#25848e","#25858e","#24868e","#24878e","#23888e","#23898e","#238a8d","#228b8d","#228c8d","#228d8d","#218e8d","#218f8d","#21908d","#21918c","#20928c","#20928c","#20938c","#1f948c","#1f958b","#1f968b","#1f978b","#1f988b","#1f998a","#1f9a8a","#1e9b8a","#1e9c89","#1e9d89","#1f9e89","#1f9f88","#1fa088","#1fa188","#1fa187","#1fa287","#20a386","#20a486","#21a585","#21a685","#22a785","#22a884","#23a983","#24aa83","#25ab82","#25ac82","#26ad81","#27ad81","#28ae80","#29af7f","#2ab07f","#2cb17e","#2db27d","#2eb37c","#2fb47c","#31b57b","#32b67a","#34b679","#35b779","#37b878","#38b977","#3aba76","#3bbb75","#3dbc74","#3fbc73","#40bd72","#42be71","#44bf70","#46c06f","#48c16e","#4ac16d","#4cc26c","#4ec36b","#50c46a","#52c569","#54c568","#56c667","#58c765","#5ac864","#5cc863","#5ec962","#60ca60","#63cb5f","#65cb5e","#67cc5c","#69cd5b","#6ccd5a","#6ece58","#70cf57","#73d056","#75d054","#77d153","#7ad151","#7cd250","#7fd34e","#81d34d","#84d44b","#86d549","#89d548","#8bd646","#8ed645","#90d743","#93d741","#95d840","#98d83e","#9bd93c","#9dd93b","#a0da39","#a2da37","#a5db36","#a8db34","#aadc32","#addc30","#b0dd2f","#b2dd2d","#b5de2b","#b8de29","#bade28","#bddf26","#c0df25","#c2df23","#c5e021","#c8e020","#cae11f","#cde11d","#d0e11c","#d2e21b","#d5e21a","#d8e219","#dae319","#dde318","#dfe318","#e2e418","#e5e419","#e7e419","#eae51a","#ece51b","#efe51c","#f1e51d","#f4e61e","#f6e620","#f8e621","#fbe723","#fde725"],
                category: "Built-in palettes"
            },
            {
                id: "viridis_rev",
                name: "Viridis (rev)",
                colors: ["#fde725","#fbe723","#f8e621","#f6e620","#f4e61e","#f1e51d","#efe51c","#ece51b","#eae51a","#e7e419","#e5e419","#e2e418","#dfe318","#dde318","#dae319","#d8e219","#d5e21a","#d2e21b","#d0e11c","#cde11d","#cae11f","#c8e020","#c5e021","#c2df23","#c0df25","#bddf26","#bade28","#b8de29","#b5de2b","#b2dd2d","#b0dd2f","#addc30","#aadc32","#a8db34","#a5db36","#a2da37","#a0da39","#9dd93b","#9bd93c","#98d83e","#95d840","#93d741","#90d743","#8ed645","#8bd646","#89d548","#86d549","#84d44b","#81d34d","#7fd34e","#7cd250","#7ad151","#77d153","#75d054","#73d056","#70cf57","#6ece58","#6ccd5a","#69cd5b","#67cc5c","#65cb5e","#63cb5f","#60ca60","#5ec962","#5cc863","#5ac864","#58c765","#56c667","#54c568","#52c569","#50c46a","#4ec36b","#4cc26c","#4ac16d","#48c16e","#46c06f","#44bf70","#42be71","#40bd72","#3fbc73","#3dbc74","#3bbb75","#3aba76","#38b977","#37b878","#35b779","#34b679","#32b67a","#31b57b","#2fb47c","#2eb37c","#2db27d","#2cb17e","#2ab07f","#29af7f","#28ae80","#27ad81","#26ad81","#25ac82","#25ab82","#24aa83","#23a983","#22a884","#22a785","#21a685","#21a585","#20a486","#20a386","#1fa287","#1fa187","#1fa188","#1fa088","#1f9f88","#1f9e89","#1e9d89","#1e9c89","#1e9b8a","#1f9a8a","#1f998a","#1f988b","#1f978b","#1f968b","#1f958b","#1f948c","#20938c","#20928c","#20928c","#21918c","#21908d","#218f8d","#218e8d","#228d8d","#228c8d","#228b8d","#238a8d","#23898e","#23888e","#24878e","#24868e","#25858e","#25848e","#25838e","#26828e","#26828e","#26818e","#27808e","#277f8e","#277e8e","#287d8e","#287c8e","#297b8e","#297a8e","#29798e","#2a788e","#2a778e","#2a768e","#2b758e","#2b748e","#2c738e","#2c728e","#2c718e","#2d718e","#2d708e","#2e6f8e","#2e6e8e","#2e6d8e","#2f6c8e","#2f6b8e","#306a8e","#30698e","#31688e","#31678e","#31668e","#32658e","#32648e","#33638d","#33628d","#34618d","#34608d","#355f8d","#355e8d","#365d8d","#365c8d","#375b8d","#375a8c","#38598c","#38588c","#39568c","#39558c","#3a548c","#3a538b","#3b528b","#3b518b","#3c508b","#3c4f8a","#3d4e8a","#3d4d8a","#3e4c8a","#3e4a89","#3e4989","#3f4889","#3f4788","#404688","#404588","#414487","#414287","#424186","#424086","#423f85","#433e85","#433d84","#443b84","#443a83","#443983","#453882","#453781","#453581","#463480","#46337f","#46327e","#46307e","#472f7d","#472e7c","#472d7b","#472c7a","#472a7a","#482979","#482878","#482677","#482576","#482475","#482374","#482173","#482071","#481f70","#481d6f","#481c6e","#481b6d","#481a6c","#48186a","#481769","#481668","#481467","#471365","#471164","#471063","#470e61","#470d60","#460b5e","#460a5d","#46085c","#46075a","#450559","#450457","#440256","#440154"],
                category: "Built-in palettes"
            },
            {
                id: "magma",
                name: "Magma",
                colors: ["#000004","#010005","#010106","#010108","#020109","#02020b","#02020d","#03030f","#030312","#040414","#050416","#060518","#06051a","#07061c","#08071e","#090720","#0a0822","#0b0924","#0c0926","#0d0a29","#0e0b2b","#100b2d","#110c2f","#120d31","#130d34","#140e36","#150e38","#160f3b","#180f3d","#19103f","#1a1042","#1c1044","#1d1147","#1e1149","#20114b","#21114e","#221150","#241253","#251255","#271258","#29115a","#2a115c","#2c115f","#2d1161","#2f1163","#311165","#331067","#341069","#36106b","#38106c","#390f6e","#3b0f70","#3d0f71","#3f0f72","#400f74","#420f75","#440f76","#451077","#471078","#491078","#4a1079","#4c117a","#4e117b","#4f127b","#51127c","#52137c","#54137d","#56147d","#57157e","#59157e","#5a167e","#5c167f","#5d177f","#5f187f","#601880","#621980","#641a80","#651a80","#671b80","#681c81","#6a1c81","#6b1d81","#6d1d81","#6e1e81","#701f81","#721f81","#732081","#752181","#762181","#782281","#792282","#7b2382","#7c2382","#7e2482","#802582","#812581","#832681","#842681","#862781","#882781","#892881","#8b2981","#8c2981","#8e2a81","#902a81","#912b81","#932b80","#942c80","#962c80","#982d80","#992d80","#9b2e7f","#9c2e7f","#9e2f7f","#a02f7f","#a1307e","#a3307e","#a5317e","#a6317d","#a8327d","#aa337d","#ab337c","#ad347c","#ae347b","#b0357b","#b2357b","#b3367a","#b5367a","#b73779","#b83779","#ba3878","#bc3978","#bd3977","#bf3a77","#c03a76","#c23b75","#c43c75","#c53c74","#c73d73","#c83e73","#ca3e72","#cc3f71","#cd4071","#cf4070","#d0416f","#d2426f","#d3436e","#d5446d","#d6456c","#d8456c","#d9466b","#db476a","#dc4869","#de4968","#df4a68","#e04c67","#e24d66","#e34e65","#e44f64","#e55064","#e75263","#e85362","#e95462","#ea5661","#eb5760","#ec5860","#ed5a5f","#ee5b5e","#ef5d5e","#f05f5e","#f1605d","#f2625d","#f2645c","#f3655c","#f4675c","#f4695c","#f56b5c","#f66c5c","#f66e5c","#f7705c","#f7725c","#f8745c","#f8765c","#f9785d","#f9795d","#f97b5d","#fa7d5e","#fa7f5e","#fa815f","#fb835f","#fb8560","#fb8761","#fc8961","#fc8a62","#fc8c63","#fc8e64","#fc9065","#fd9266","#fd9467","#fd9668","#fd9869","#fd9a6a","#fd9b6b","#fe9d6c","#fe9f6d","#fea16e","#fea36f","#fea571","#fea772","#fea973","#feaa74","#feac76","#feae77","#feb078","#feb27a","#feb47b","#feb67c","#feb77e","#feb97f","#febb81","#febd82","#febf84","#fec185","#fec287","#fec488","#fec68a","#fec88c","#feca8d","#fecc8f","#fecd90","#fecf92","#fed194","#fed395","#fed597","#fed799","#fed89a","#fdda9c","#fddc9e","#fddea0","#fde0a1","#fde2a3","#fde3a5","#fde5a7","#fde7a9","#fde9aa","#fdebac","#fcecae","#fceeb0","#fcf0b2","#fcf2b4","#fcf4b6","#fcf6b8","#fcf7b9","#fcf9bb","#fcfbbd","#fcfdbf"],
                category: "Built-in palettes"
            },
            {
                id: "magma_rev",
                name: "Magma (rev)",
                colors: ["#fcfdbf","#fcfbbd","#fcf9bb","#fcf7b9","#fcf6b8","#fcf4b6","#fcf2b4","#fcf0b2","#fceeb0","#fcecae","#fdebac","#fde9aa","#fde7a9","#fde5a7","#fde3a5","#fde2a3","#fde0a1","#fddea0","#fddc9e","#fdda9c","#fed89a","#fed799","#fed597","#fed395","#fed194","#fecf92","#fecd90","#fecc8f","#feca8d","#fec88c","#fec68a","#fec488","#fec287","#fec185","#febf84","#febd82","#febb81","#feb97f","#feb77e","#feb67c","#feb47b","#feb27a","#feb078","#feae77","#feac76","#feaa74","#fea973","#fea772","#fea571","#fea36f","#fea16e","#fe9f6d","#fe9d6c","#fd9b6b","#fd9a6a","#fd9869","#fd9668","#fd9467","#fd9266","#fc9065","#fc8e64","#fc8c63","#fc8a62","#fc8961","#fb8761","#fb8560","#fb835f","#fa815f","#fa7f5e","#fa7d5e","#f97b5d","#f9795d","#f9785d","#f8765c","#f8745c","#f7725c","#f7705c","#f66e5c","#f66c5c","#f56b5c","#f4695c","#f4675c","#f3655c","#f2645c","#f2625d","#f1605d","#f05f5e","#ef5d5e","#ee5b5e","#ed5a5f","#ec5860","#eb5760","#ea5661","#e95462","#e85362","#e75263","#e55064","#e44f64","#e34e65","#e24d66","#e04c67","#df4a68","#de4968","#dc4869","#db476a","#d9466b","#d8456c","#d6456c","#d5446d","#d3436e","#d2426f","#d0416f","#cf4070","#cd4071","#cc3f71","#ca3e72","#c83e73","#c73d73","#c53c74","#c43c75","#c23b75","#c03a76","#bf3a77","#bd3977","#bc3978","#ba3878","#b83779","#b73779","#b5367a","#b3367a","#b2357b","#b0357b","#ae347b","#ad347c","#ab337c","#aa337d","#a8327d","#a6317d","#a5317e","#a3307e","#a1307e","#a02f7f","#9e2f7f","#9c2e7f","#9b2e7f","#992d80","#982d80","#962c80","#942c80","#932b80","#912b81","#902a81","#8e2a81","#8c2981","#8b2981","#892881","#882781","#862781","#842681","#832681","#812581","#802582","#7e2482","#7c2382","#7b2382","#792282","#782281","#762181","#752181","#732081","#721f81","#701f81","#6e1e81","#6d1d81","#6b1d81","#6a1c81","#681c81","#671b80","#651a80","#641a80","#621980","#601880","#5f187f","#5d177f","#5c167f","#5a167e","#59157e","#57157e","#56147d","#54137d","#52137c","#51127c","#4f127b","#4e117b","#4c117a","#4a1079","#491078","#471078","#451077","#440f76","#420f75","#400f74","#3f0f72","#3d0f71","#3b0f70","#390f6e","#38106c","#36106b","#341069","#331067","#311165","#2f1163","#2d1161","#2c115f","#2a115c","#29115a","#271258","#251255","#241253","#221150","#21114e","#20114b","#1e1149","#1d1147","#1c1044","#1a1042","#19103f","#180f3d","#160f3b","#150e38","#140e36","#130d34","#120d31","#110c2f","#100b2d","#0e0b2b","#0d0a29","#0c0926","#0b0924","#0a0822","#090720","#08071e","#07061c","#06051a","#060518","#050416","#040414","#030312","#03030f","#02020d","#02020b","#020109","#010108","#010106","#010005","#000004"],
                category: "Built-in palettes"
            }
        ],
        quantile: [
            {
                id: "default",
                name: "Deciles 1",
                colors: ['#3288bd',
                    '#66c2a5',
                    '#abdda4',
                    '#e6f598',
                    '#ffffbf',
                    '#fee08b',
                    '#fdae61',
                    '#f46d43',
                    '#d53e4f'
                ],
                category: "Built-in palettes"
            }
        ],
        discrete: [
            {
                id: 'default', name: "Default",
                colors: d3.scale.category20().range().concat(d3.scale.category20b().range()),
                category: "Built-in palettes"
            },
            {
                id: "dku_dss_next",
                name: "DSS Next",
                colors: ["#00AEDB", "#8CC63F", "#FFC425", "#F37735", "#D11141", "#91268F", "#194BA3", "#00B159"],
                category: "Built-in palettes"
            },
            {
                id: 'dku_pastel1',
                name: "Pastel",
                colors: ["#EC6547", "#FDC665", "#95C37B", "#75C2CC", "#694A82", "#538BC8", "#65B890", "#A874A0"],
                category: "Built-in palettes"
            },
            {
                id: 'dku_corpo1',
                name: "Corporate",
                colors: ["#0075B2", "#818991", "#EA9423", "#A4C2DB", "#EF3C39", "#009D4B", "#CFD6D3", "#231F20"],
                category: "Built-in palettes"
            },
            {
                id: 'dku_deuteranopia1',
                name: "Deuteranopia",
                colors: ["#193C81", "#7EA0F9", "#211924", "#757A8D", "#D6C222", "#776A37", "#AE963A", "#655E5D"],
                category: "Built-in palettes"
            },
            {
                id: 'dku_tritanopia1',
                name: "Tritanopia",
                colors: ["#CA0849", "#0B4D61", "#E4B2BF", "#3F6279", "#F24576", "#7D8E98", "#9C4259", "#2B2A2E"],
                category: "Built-in palettes"
            },
            {
                id: 'dku_pastel2',
                name: 'Pastel 2',
                colors: ["#f06548", "#fdc766", "#7bc9a6", "#4ec5da", "#548ecb", "#97668f", "#5e2974"],
                category: "Built-in palettes"
            }
        ],

        diverging: [],


        /*
         *   The following is used in plugins to add new palettes, don't rename those methods
         */

        addDiscrete: function (palette) {
            if (window.dkuColorPalettes.discrete.find(p => p.id === palette.id)) {
                console.warn("Discrete color palette '" + palette.id + "' already exists, it will be overriden."); /*@console*/  // NOSONAR: OK to use console.
                window.dkuColorPalettes.discrete = window.dkuColorPalettes.discrete.filter(p => p.id !== palette.id);
            }
            window.dkuColorPalettes.discrete.push(palette);
        },

        addContinuous: function (palette) {
            if (window.dkuColorPalettes.continuous.find(p => p.id === palette.id)) {
                console.warn("Continuous color palette '" + palette.id + "' already exists, it will be overriden."); /*@console*/  // NOSONAR: OK to use console.
                window.dkuColorPalettes.continuous = window.dkuColorPalettes.continuous.filter(p => p.id !== palette.id);
            }
            window.dkuColorPalettes.continuous.push(palette);
        },

        addDiverging: function (palette) {
            if (window.dkuColorPalettes.diverging.find(p => p.id === palette.id)) {
                console.warn("Diverging color palette '" + palette.id + "' already exists, it will be overriden."); /*@console*/  // NOSONAR: OK to use console.
                window.dkuColorPalettes.diverging = window.dkuColorPalettes.diverging.filter(p => p.id !== palette.id);
            }
            window.dkuColorPalettes.diverging.push(palette);
        }
    };

})();