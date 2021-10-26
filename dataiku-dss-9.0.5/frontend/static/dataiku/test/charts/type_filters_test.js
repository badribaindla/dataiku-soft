describe('typesToIconAndLabel filters test', function () {
    beforeEach(module('dataiku.mock'));
    beforeEach(module('dataiku.services'));

    beforeEach(module('dataiku.filters'));

    let datasetTypeToIcon;
    let datasetTypeToName;
    let connectionTypeToNameForList;
    let connectionTypeToNameForItem;
    let connectionTypeToIcon;
    let recipeTypeToIcon;
    let modelTypeToIcon;
    let typeToIcon;
    let recipeTypeToLanguage;
    let niceType;
    let fsProviderDisplayName;
    beforeEach(inject(function (datasetTypeToNameFilter, datasetTypeToIconFilter, connectionTypeToNameForListFilter,
                                connectionTypeToNameForItemFilter, connectionTypeToIconFilter, recipeTypeToIconFilter,
                                modelTypeToIconFilter, typeToIconFilter, recipeTypeToLanguageFilter, niceTypeFilter,
                                fsProviderDisplayNameFilter) {
        datasetTypeToName = datasetTypeToNameFilter;
        datasetTypeToIcon = datasetTypeToIconFilter;
        connectionTypeToNameForList = connectionTypeToNameForListFilter;
        connectionTypeToNameForItem = connectionTypeToNameForItemFilter;
        connectionTypeToIcon = connectionTypeToIconFilter;
        recipeTypeToIcon = recipeTypeToIconFilter;
        modelTypeToIcon = modelTypeToIconFilter;
        typeToIcon = typeToIconFilter;
        recipeTypeToLanguage = recipeTypeToLanguageFilter;
        niceType = niceTypeFilter;
        fsProviderDisplayName = fsProviderDisplayNameFilter;
    }));

    const OBJECT_KEY = 'objectKey';
    const TYPE_KEY = 'typeKey';

    function buildCustomDefinition(objectKey, typeKey) {
        return {
            [OBJECT_KEY]: objectKey,
            [TYPE_KEY]: typeKey
        };
    }

    const CUSTOM_DATASETS = buildCustomDefinition('customDatasets', 'datasetType');
    const CUSTOM_PROVIDER_FS = buildCustomDefinition('customFSProviders', 'fsProviderType');
    const CUSTOM_RECIPES = buildCustomDefinition('customCodeRecipes', 'recipeType');
    let rootScopeForAppConfig;
    beforeEach(inject(function ($rootScope) {
        rootScopeForAppConfig = $rootScope;
        rootScopeForAppConfig.appConfig = {};
    }));

    function addMockedItemInCustoms(type, customToMock, icon, label, definedDesc, withOwnerPluginDesc) {
        let newMock = {
            [customToMock[TYPE_KEY]]: type
        };
        if (definedDesc) {
            Object.assign(newMock, {
                desc: {
                    meta: {
                        icon: icon,
                        label: label
                    }
                }
            });
        }
        const objectKey = customToMock[OBJECT_KEY];
        if (!(rootScopeForAppConfig.appConfig.hasOwnProperty(objectKey))) {
            rootScopeForAppConfig.appConfig[objectKey] = [];
        }

        if (withOwnerPluginDesc) {
            const ownerPluginId = 'ownerPluginId';
            Object.assign(newMock, {ownerPluginId: ownerPluginId});
            rootScopeForAppConfig.appConfig['loadedPlugins'] = [{id: ownerPluginId, icon: icon}];
        }
        rootScopeForAppConfig.appConfig[objectKey].push(newMock);
    }

    function addMockedLabelInCustoms(type, customToMock, value) {
        addMockedItemInCustoms(type, customToMock, undefined, value, true);
    }

    function addMockedIconInCustoms(type, customToMock, value) {
        addMockedItemInCustoms(type, customToMock, value, undefined, true);
    }

    function addMockedItemWithNoDescInCustoms(type, customToMock) {
        addMockedItemInCustoms(type, customToMock, undefined, undefined, false);
    }

    function addMockedItemWithOwnerPluginDesc(type, customToMock, icon) {
        addMockedItemInCustoms(type, customToMock, icon, undefined, false, true);
    }

    describe('datasetTypeToName', function () {
        describe('no type provided', function () {
            it('returns empty', function () {
                expect(datasetTypeToName('')).toBe('');
                expect(datasetTypeToName(undefined)).toBe('');
            });
        });

        describe('type found in registered dataset types', function () {
            it('returns existing label', function () {
                expect(datasetTypeToName('cachedhttp')).toBe('HTTP (with cache)');
            });
        });

        describe('type found with different case in registered dataset types', function () {
            it('returns existing label', function () {
                expect(datasetTypeToName('CachedHTTP')).toBe('HTTP (with cache)');
            });
        });

        describe('type found but no label defined', function () {
            it('returns type', function () {
                expect(datasetTypeToName('remotefiles')).toBe('remotefiles');
            });
        });

        describe('missing type', function () {
            describe('type not prefixed', function () {
                it('returns lower-cased type', function () {
                    expect(datasetTypeToName('UnknownType')).toBe('unknowntype');
                });
            });

            describe('custom prefix', function () {
                describe('type in plugin dataset', function () {
                    it('returns plugin dataset label', function () {
                        addMockedLabelInCustoms('custom-KnownType', CUSTOM_DATASETS, 'custom-label');
                        expect(datasetTypeToName('custom-KnownType')).toBe('custom-label');
                    });
                });
                describe('type not in plugin dataset but in FS provider', function () {
                    it('returns custom FS provider label', function () {
                        addMockedLabelInCustoms('custom-KnownType', CUSTOM_DATASETS, 'custom-label');
                        addMockedLabelInCustoms('custom-KnownFSType', CUSTOM_PROVIDER_FS, 'custom-fs-label');
                        expect(datasetTypeToName('custom-KnownFSType')).toBe('custom-fs-label');
                    });
                });
                describe('type neither in plugin dataset nor in FS provider', function () {
                    it('returns null', function () {
                        addMockedLabelInCustoms('custom-KnownType', CUSTOM_DATASETS, 'custom-label');
                        addMockedLabelInCustoms('custom-KnownFSType', CUSTOM_PROVIDER_FS, 'custom-fs-label');
                        expect(datasetTypeToName('custom-UnknownType')).toBeNull();
                    });
                });
                describe('type in custom', function () {
                    describe('no desc', function () {
                        it('returns type', function () {
                            addMockedItemWithNoDescInCustoms('custom-KnownTypeWithNoDesc', CUSTOM_DATASETS);
                            expect(datasetTypeToName('custom-KnownTypeWithNoDesc')).toBe('custom-KnownTypeWithNoDesc');
                        });
                    });
                    it('returns plugin dataset label', function () {
                        addMockedLabelInCustoms('custom-KnownType', CUSTOM_DATASETS, 'custom-label');
                        expect(datasetTypeToName('custom-KnownType')).toBe('custom-label');
                    });
                });
            });
            describe('Custom prefix with first upper case letter', function () {
                describe('type in plugin dataset', function () {
                    it('returns plugin dataset label', function () {
                        addMockedLabelInCustoms('Custom-KnownType-Prefix-Not-Case-Sensitive', CUSTOM_DATASETS, 'custom-label');
                        expect(datasetTypeToName('Custom-KnownType-Prefix-Not-Case-Sensitive')).toBe('custom-label');
                    });
                });
            });

            describe('fsprovider_ prefix', function () {
                describe('type in plugin dataset', function () {
                    it('returns plugin dataset label no matter the prefix case', function () {
                        addMockedLabelInCustoms('custom-KnownType', CUSTOM_DATASETS, 'custom-label');
                        addMockedLabelInCustoms('fsprovider_KnownType-lowercase', CUSTOM_PROVIDER_FS,
                            'custom-fs-label-lc');
                        addMockedLabelInCustoms('FSPROVIDER_KnownType-uppercase', CUSTOM_PROVIDER_FS,
                            'custom-fs-label-uc');
                        expect(datasetTypeToName('fsprovider_KnownType-lowercase')).toBe('custom-fs-label-lc');
                        expect(datasetTypeToName('FSPROVIDER_KnownType-uppercase')).toBe('custom-fs-label-uc');
                    });
                });
            });
        });
    });

    describe('datasetTypeToIcon', function () {
        describe('type found in registered dataset types', function () {
            it('returns existing icon', function () {
                expect(datasetTypeToIcon('bigquery')).toBe('icon-google-bigquery');
            });
        });

        describe('missing type', function () {
            describe('type not prefixed', function () {
                it('returns lower-cased type with icon prefix', function () {
                    expect(datasetTypeToIcon('UnknownType')).toBe('icon-unknowntype');
                });
            });

            describe('custom prefix', function () {
                describe('type in plugin dataset', function () {
                    it('returns plugin dataset icon', function () {
                        addMockedIconInCustoms('custom-KnownType', CUSTOM_DATASETS, 'custom-icon');
                        expect(datasetTypeToIcon('custom-KnownType')).toBe('custom-icon');
                    });
                });

                describe('type neither in plugin dataset nor in FS provider', function () {
                    it('returns null', function () {
                        addMockedIconInCustoms('custom-KnownType', CUSTOM_DATASETS, 'custom-label');
                        addMockedIconInCustoms('custom-KnownFSType', CUSTOM_PROVIDER_FS, 'custom-fs-label');
                        expect(datasetTypeToIcon('custom-UnknownType')).toBe('icon-question-sign');
                    });
                });
                describe('type in custom', function () {
                    describe('no desc', function () {
                        describe('in owner plugin', function () {
                            it('returns plugin icon', function () {
                                addMockedItemWithOwnerPluginDesc('custom-KnownTypeWithNoDescButPlugin', CUSTOM_DATASETS, 'plugin-icon');
                                expect(datasetTypeToIcon('custom-KnownTypeWithNoDescButPlugin')).toBe('plugin-icon');
                            });
                            describe('but no icon in plugin', function () {
                                it('returns puzzle piece icon', function () {
                                    addMockedItemWithOwnerPluginDesc('custom-KnownTypeWithNoDescButPluginWithNoIcon', CUSTOM_DATASETS, undefined);
                                    expect(datasetTypeToIcon('custom-KnownTypeWithNoDescButPluginWithNoIcon')).toBe('icon-puzzle-piece');
                                });
                            });
                        });
                        describe('not in owner plugin', function () {
                            it('returns puzzle piece icon', function () {
                                addMockedItemWithOwnerPluginDesc('custom-KnownTypeWithNoDescNotPlugin', CUSTOM_DATASETS, undefined);
                                expect(datasetTypeToIcon('custom-KnownTypeWithNoDescNotPlugin')).toBe('icon-puzzle-piece');
                            });
                        });
                    });
                });
            });
        });
    });

    describe('connectionTypeToNameForList', function () {
        describe('type found in registered connection types', function () {
            it('returns existing label for list', function () {
                expect(connectionTypeToNameForList('ec2')).toBe('Amazon S3');
                expect(connectionTypeToNameForList('saphana')).toBe('SAP Hana');
                expect(connectionTypeToNameForList('SAPHANA')).toBe('SAP Hana');
                expect(connectionTypeToNameForList('jdbc')).toBe('Other SQL databases');
                expect(connectionTypeToNameForList('ssh')).toBe('SCP/SFTP');
            });
        });

        describe('missing type', function () {
            it('returns lower-cased type', function () {
                expect(connectionTypeToNameForList('UnknownType')).toBe('unknowntype');
            });
        });
    });

    describe('connectionTypeToNameForItem', function () {
        describe('type found in registered connection types', function () {
            it('returns existing label for list', function () {
                expect(connectionTypeToNameForItem('ec2')).toBe('Amazon S3');
                expect(connectionTypeToNameForItem('azure')).toBe('Azure Blob Storage');
                expect(connectionTypeToNameForItem('AZURE')).toBe('Azure Blob Storage');
                expect(connectionTypeToNameForItem('jdbc')).toBe('SQL database (JDBC)');
                expect(connectionTypeToNameForItem('ssh')).toBe('SCP/SFTP');
            });
        });

        describe('missing type', function () {
            it('returns lower-cased type', function () {
                expect(connectionTypeToNameForItem('UnknownType')).toBe('unknowntype');
            });
        });
    });

    describe('connectionTypeToIcon', function () {
        describe('type found in registered connection types', function () {
            it('returns existing icon', function () {
                expect(connectionTypeToIcon('ec2')).toBe('icon-amazon_s3');
                expect(connectionTypeToIcon('vertica')).toBe('icon-HP_vertica');
                expect(connectionTypeToIcon('VERTICA')).toBe('icon-HP_vertica');
                expect(connectionTypeToIcon('jdbc')).toBe('icon-other_sql');
                expect(connectionTypeToIcon('ssh')).toBe('icon-FTP-HTTP-SSH');
            });
        });

        describe('missing type', function () {
            describe('type not prefixed', function () {
                it('returns lower-cased type with icon prefix', function () {
                    expect(connectionTypeToIcon('UnknownType')).toBe('icon-unknowntype');
                });
            });
        });
    });

    describe('recipeTypeToIcon', function () {
        describe('type found in registered recipe types', function () {
            it('returns existing icon', function () {
                expect(recipeTypeToIcon('clustering_cluster')).toBe('icon-clustering_recipe');
                expect(recipeTypeToIcon('SPLIT')).toBe('icon-visual_prep_split_recipe');
            });
        });

        describe('missing type', function () {
            describe('type not prefixed', function () {
                it('returns lower-cased type with icon prefix', function () {
                    expect(recipeTypeToIcon('UnknownType')).toBe('icon-unknowntype');
                });
            });

            describe('custom prefix', function () {
                describe('type in plugin recipes', function () {
                    it('returns plugin recipe icon', function () {
                        addMockedIconInCustoms('custom-KnownType', CUSTOM_RECIPES, 'custom-recipe-icon');
                        expect(recipeTypeToIcon('custom-KnownType')).toBe('custom-recipe-icon');
                    });
                });
            });
        });
    });

    describe('recipeTypeToLanguage', function () {
        describe('type found in registered recipe types', function () {
            it('returns existing language', function () {
                expect(recipeTypeToLanguage('pig')).toBe('text/x-dkupig');
                expect(recipeTypeToLanguage('PIG')).toBe('text/x-dkupig');
            });
            it('returns undefined when no language field', function () {
                expect(recipeTypeToLanguage('Clustering_Cluster')).toBeUndefined();
            });
        });

        describe('missing type', function () {
            it('returns undefined', function () {
                expect(recipeTypeToLanguage('UnknownType')).toBeUndefined();
            });
        });
    });

    describe('modelTypeToIcon', function () {
        describe('type found in registered model types', function () {
            it('returns existing icon', function () {
                expect(modelTypeToIcon('prediction')).toBe('icon-beaker');
                expect(modelTypeToIcon('REGRESSION')).toBe('icon-machine_learning_regression');
                expect(modelTypeToIcon('clustering')).toBe('icon-machine_learning_clustering');
            });
        });

        describe('missing type', function () {
            describe('type not prefixed', function () {
                it('returns lower-cased type with icon prefix', function () {
                    expect(modelTypeToIcon('UnknownType')).toBe('icon-unknowntype');
                });
            });
        });
    });

    describe('typeToIcon', function () {
        describe('type found in registered types', function () {
            it('returns existing icon', function () {
                expect(typeToIcon('redshift')).toBe('icon-amazon_redshift');
                expect(typeToIcon('JOBSDB')).toBe('icon-bar-chart');
                expect(typeToIcon('ec2')).toBe('icon-amazon_s3');
                expect(typeToIcon('grouping')).toBe('icon-visual_prep_group_recipe');
                expect(typeToIcon('prediction')).toBe('icon-beaker');
                expect(typeToIcon('column')).toBe('icon-list icon-rotate-90');
                expect(typeToIcon('shiny')).toBe('icon-code_r_recipe');
                expect(typeToIcon('insight')).toBe('icon-dku-nav_dashboard');
                expect(typeToIcon('report')).toBe('icon-DKU_rmd');
                expect(typeToIcon('jupyter_notebook')).toBe('icon-dku-nav_notebook');
            });
        });

        describe('missing type', function () {
            describe('type not prefixed', function () {
                it('returns lower-cased type with icon prefix', function () {
                    expect(typeToIcon('UnknownType')).toBe('icon-unknowntype');
                });
            });
        });
    });

    describe('niceType', function () {
        describe('type found in registered nice types', function () {
            it('returns existing icon', function () {
                expect(niceType('Filesystem')).toBe("Server's Filesystem");
                expect(niceType('ec2')).toBe("Amazon S3");
            });
        });

        describe('missing type', function () {
            describe('type not prefixed', function () {
                it('returns lower-cased type', function () {
                    expect(niceType('UnknownType')).toBe('unknowntype');
                });
            });
        });
    });

    describe('fsProviderDisplayName', function () {
        describe('type found in registered FS provider types', function () {
            it('returns existing icon', function () {
                expect(fsProviderDisplayName('Filesystem')).toBe("Server's Filesystem");
                expect(fsProviderDisplayName('URL')).toBe("HTTP or FTP URL");
            });
        });

        describe('missing type', function () {
            describe('type not prefixed', function () {
                it('returns lower-cased type', function () {
                    expect(fsProviderDisplayName('UnknownType')).toBe('unknowntype');
                });
            });
        });
    });
});