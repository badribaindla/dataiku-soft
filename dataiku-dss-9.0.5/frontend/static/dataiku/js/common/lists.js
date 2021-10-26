(function(){
    'use strict';

    var app = angular.module('dataiku.common.lists', []);

    app.factory('ListFilter', function() {

        function filterList(list, query) {
            // query is either A. an ["array", "of", "strings"],
            // or B. a single /regexp/ or "string"
            return (Array.isArray(query)
                ? query.reduce(filterList, list)    // A
                : list.filter(objectMatchesQuery.bind(null, query)));   // B
        }

        function Pagination(list, perPage) {
            this.list = list;
            this.page = 1;  // /!\ 1-based
            this.perPage = perPage || 100;
            this.update();
        }
        Pagination.prototype.update = function updatePagination() {
            if (!this.list || !this.list.length || this.page <= 0) {
                this.slice = [];
                this.from = this.to = this.size = 0;
                return;
            } else {
                this.size = this.list.length;
            }
            this.maxPage = Math.ceil(this.size / this.perPage);
            this.page = Math.min(this.page, this.maxPage);
            this.from = (this.page - 1) * this.perPage;
            this.to = Math.min(this.list.length, this.from + this.perPage) - 1;
            this.slice = this.list.slice(this.from, this.to + 1);
            // page controls, e.g. when on page 6: [1, null, 4, 5, 6, 7, 8, null, 16]
            this.controls = Array(this.maxPage);
            for(var i = this.controls.length; i > 0; i--) { this.controls[i-1] = i; }
            if (this.maxPage > 10) { // keep 2 before, 2 after, and both ends
                if (this.page > 5) {
                    i = this.controls.splice(1, this.page - 4, null).length - 1;
                } // else i = 0; // already from the loop
                if (this.maxPage - this.page > 4) {
                    this.controls.splice(this.page - i + 2, this.maxPage - this.page - 3, null);
                }
            }
        };
        Pagination.prototype.go = function(p) { switch (p) {
            case 0 : this.page = Math.min(this.maxPage, this.page + 1); break;
            case -1: this.page = Math.max(           1, this.page - 1); break;
            default: this.page = p;
        } };    // NB: doesn't call update, this.page is probably $watch()ed
        Pagination.prototype.next = function() { this.go( 0); };
        Pagination.prototype.prev = function() { this.go(-1); };

        Pagination.prototype.nextPage = function(){
            this.page = Math.min(this.maxPage, this.page + 1);
        }
        Pagination.prototype.prevPage = function(){
            this.page = Math.max(1, this.page - 1);
        }
        // No bounds check is performed. Pages are 1-indexed
        Pagination.prototype.goToPage = function(page){
            this.page = page;
        }

        Pagination.prototype.updateAndGetSlice = function(list){
            this.list = list;
            this.update();
            return this.slice;
        }

        return {
            /**
             * Filters a list (array) of Objects according to a queryString.
             * If queryString looks like a /regex/i, filter will use a regex,
             * otherwise it will use whitespace-separated literal tokens.
             */
            filter: function filter(list, queryString) {
                queryString = queryString && queryString.trim();
                if (!list) return [];
                if (!queryString) return list.concat();  // no-filter fast-pass
                var regex = queryString.match(/^\/(.+)\/$/);
                return filterList(list, regex ? new RegExp(regex[1], 'i')
                    : queryString.toLowerCase().split(/\s+/));
            },
            /**
             * Handles pagination.
             * Invoke with `new`, then set its `page` and call `update()`.
             */
            Pagination: Pagination
        };
    });

})();
