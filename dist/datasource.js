"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var _ = require("lodash");
var angular = require("angular");
var moment = require("moment");
var GnocchiDatasource = (function () {
    function GnocchiDatasource(instanceSettings, $q, backendSrv, templateSrv) {
        this.$q = $q;
        this.backendSrv = backendSrv;
        this.templateSrv = templateSrv;
        var self = this;
        self.type = 'gnocchi';
        self.name = instanceSettings.name;
        self.supportMetrics = true;
        self.default_headers = {
            'Content-Type': 'application/json',
        };
        self.keystone_endpoint = null;
        self.url = self.sanitize_url(instanceSettings.url);
        if (instanceSettings.jsonData) {
            self.auth_mode = instanceSettings.jsonData.mode;
            self.project = instanceSettings.jsonData.project;
            self.username = instanceSettings.jsonData.username;
            self.password = instanceSettings.jsonData.password;
            self.roles = instanceSettings.jsonData.roles;
            self.domain = instanceSettings.jsonData.domain;
            if (self.domain === undefined || self.domain === "") {
                self.domain = 'default';
            }
        }
        if (self.roles === undefined || self.roles === "") {
            self.roles = 'admin';
        }
        if (instanceSettings.basicAuth || instanceSettings.withCredentials) {
            self.withCredentials = true;
        }
        // If the URL starts with http, we are in direct mode
        if (instanceSettings.basicAuth) {
            self.default_headers["Authorization"] = instanceSettings.basicAuth;
        }
        else if (self.auth_mode === "token") {
            self.default_headers['X-Auth-Token'] = instanceSettings.jsonData.token;
        }
        else if (self.auth_mode === "noauth") {
            self.default_headers['X-Project-Id'] = self.project;
            self.default_headers['X-User-Id'] = self.username;
            self.default_headers['X-Domain-Id'] = self.domain;
            self.default_headers['X-Roles'] = self.roles;
        }
        else if (self.auth_mode === "keystone") {
            self.url = null;
            self.keystone_endpoint = self.sanitize_url(instanceSettings.url);
        }
    }
    ////////////////
    // Plugins API
    ////////////////
    GnocchiDatasource.prototype.query = function (options) {
        var self = this;
        var targets = _.filter(options.targets, function (target) { return !target.hide; });
        var promises = _.map(targets, function (target) {
            // Ensure target is valid
            var default_measures_req = {
                url: null,
                data: null,
                method: null,
                params: {
                    'aggregation': target.aggregator,
                    'start': options.range.from.toISOString(),
                    'end': null,
                    'stop': null,
                    'granularity': null,
                    'transform': null,
                    'filter': null,
                    'needed_overlap': null,
                    'metric': null
                }
            };
            if (options.range.to) {
                // NOTE(sileht): Gnocchi API looks inconsistente
                default_measures_req.params.end = options.range.to.toISOString();
                default_measures_req.params.stop = options.range.to.toISOString();
            }
            var error = self.validateTarget(target, true);
            if (error) {
                // no need to self.$q.reject() here, error is already printed by the queryCtrl
                // console.log("target is not yet valid: " + error);
                return self.$q.when([]);
            }
            var metric_regex;
            var resource_search;
            var resource_type;
            var resource_id;
            var metric_id;
            var user_label;
            var granularity;
            var transform;
            try {
                metric_regex = self.templateSrv.replace(target.metric_name, options.scopedVars);
                resource_search = self.templateSrv.replace(target.resource_search, options.scopedVars);
                resource_type = self.templateSrv.replace(target.resource_type, options.scopedVars);
                resource_id = self.templateSrv.replace(target.resource_id, options.scopedVars);
                metric_id = self.templateSrv.replace(target.metric_id, options.scopedVars);
                user_label = self.templateSrv.replace(target.label, options.scopedVars);
                granularity = self.templateSrv.replace(target.granularity, options.scopedVars);
                transform = self.templateSrv.replace(target.transform, options.scopedVars);
            }
            catch (err) {
                return self.$q.reject(err);
            }
            resource_type = resource_type || "generic";
            if (granularity) {
                default_measures_req.params.granularity = granularity;
            }
            if (transform) {
                default_measures_req.params.transform = transform;
            }
            if (target.queryMode === "resource_search" || target.queryMode === "resource_aggregation") {
                var resource_search_req = self.buildQueryRequest(resource_type, resource_search);
                return self._gnocchi_request(resource_search_req).then(function (result) {
                    var re = new RegExp(metric_regex);
                    var metrics = {};
                    _.forEach(result, function (resource) {
                        _.forOwn(resource["metrics"], function (id, name) {
                            if (re.test(name)) {
                                metrics[id] = self._compute_label(user_label, resource, name);
                            }
                        });
                    });
                    if (target.queryMode === "resource_search") {
                        return self.$q.all(_.map(metrics, function (label, id) {
                            var measures_req = _.merge({}, default_measures_req);
                            measures_req.url = 'v1/metric/' + id + '/measures';
                            return self._retrieve_measures(label, measures_req);
                        }));
                    }
                    else {
                        var measures_req = _.merge({}, default_measures_req);
                        measures_req.url = 'v1/aggregation/metric';
                        measures_req.params.metric = _.keysIn(metrics);
                        measures_req.params.needed_overlap = target.needed_overlap;
                        return self._retrieve_measures(user_label || "unlabeled", measures_req);
                    }
                });
            }
            else if (target.queryMode === "resource") {
                var resource_req = {
                    url: 'v1/resource/' + resource_type + '/' + resource_id,
                };
                return self._gnocchi_request(resource_req).then(function (resource) {
                    var label = self._compute_label(user_label, resource, metric_regex);
                    default_measures_req.url = ('v1/resource/' + resource_type + '/' +
                        resource_id + '/metric/' + metric_regex + '/measures');
                    return self._retrieve_measures(label, default_measures_req);
                });
            }
            else if (target.queryMode === "metric") {
                var metric_req = {
                    url: 'v1/metric/' + metric_id,
                };
                return self._gnocchi_request(metric_req).then(function (metric) {
                    var label;
                    if (user_label) {
                        // NOTE(sileht): The resource returned is currently incomplete
                        // https://github.com/gnocchixyz/gnocchi/issues/310
                        label = self._compute_label(user_label, metric['resource'], metric["name"]);
                    }
                    else {
                        label = metric_id;
                    }
                    default_measures_req.url = 'v1/metric/' + metric_id + '/measures';
                    return self._retrieve_measures(label, default_measures_req);
                });
            }
        });
        return self.$q.all(promises).then(function (results) {
            return { data: _.flatten(results) };
        });
    };
    GnocchiDatasource.prototype._retrieve_measures = function (name, reqs) {
        var self = this;
        return self._gnocchi_request(reqs).then(function (result) {
            var dps = [];
            var last_granularity;
            var last_timestamp;
            var last_value;
            // NOTE(sileht): sample are ordered by granularity, then timestamp.
            _.each(_.toArray(result).reverse(), function (metricData) {
                var granularity = metricData[1];
                var timestamp = moment(metricData[0], moment.ISO_8601);
                var value = metricData[2];
                if (last_timestamp !== undefined) {
                    // We have a more precise granularity
                    if (timestamp.valueOf() >= last_timestamp.valueOf()) {
                        return;
                    }
                    var c_timestamp = last_timestamp;
                    c_timestamp.subtract(last_granularity, "seconds");
                    while (timestamp.valueOf() < c_timestamp.valueOf()) {
                        dps.push([0, c_timestamp.valueOf()]);
                        c_timestamp.subtract(last_granularity, "seconds");
                    }
                }
                last_timestamp = timestamp;
                last_granularity = granularity;
                last_value = value;
                dps.push([last_value, last_timestamp.valueOf()]);
            });
            return { target: name, datapoints: _.toArray(dps).reverse() };
        });
    };
    GnocchiDatasource.prototype._compute_label = function (label, resource, metric) {
        if (label) {
            var res = label;
            if (resource) {
                _.forOwn(resource, function (value, key) {
                    res = res.replace("${" + key + "}", value);
                    res = res.replace("$" + key, value);
                });
            }
            res = res.replace("$metric", metric);
            res = res.replace("${metric}", metric);
            return res;
        }
        else {
            return ((resource) ? resource["id"] : "no label");
        }
    };
    GnocchiDatasource.prototype.performSuggestQuery = function (query, type, target) {
        var self = this;
        var options = { url: null };
        var attribute = "id";
        var getter = function (result) {
            return _.map(result, function (item) {
                return item[attribute];
            });
        };
        if (type === 'metrics') {
            options.url = 'v1/metric';
        }
        else if (type === 'resources') {
            options.url = 'v1/resource/generic';
        }
        else if (type === 'metric_names') {
            if (target.queryMode === "resource" && target.resource_id !== "") {
                options.url = 'v1/resource/generic/' + target.resource_id;
                getter = function (result) {
                    return Object.keys(result["metrics"]);
                };
            }
            else {
                return self.$q.when([]);
            }
        }
        else {
            return self.$q.when([]);
        }
        return self._gnocchi_request(options).then(getter);
    };
    GnocchiDatasource.prototype.metricFindQuery = function (query) {
        var self = this;
        var req = { method: 'POST', url: null, data: null, params: { filter: null } };
        var resourceQuery = query.match(/^resources\(([^,]*),\s?([^,]*),\s?([^\)]+?)\)/);
        if (resourceQuery) {
            var resource_search;
            try {
                req.url = self.templateSrv.replace('v1/search/resource/' + resourceQuery[1]);
                resource_search = self.templateSrv.replace(resourceQuery[3]);
                if (resource_search.trim()[0] === '{') {
                    angular.toJson(angular.fromJson(resource_search));
                }
            }
            catch (err) {
                return self.$q.reject(err);
            }
            if (resource_search.trim()[0] === '{') {
                req.data = resource_search;
            }
            else {
                req.params.filter = resource_search;
            }
            return self._gnocchi_request(req).then(function (result) {
                var values = _.map(result, function (resource) {
                    var value = resource[resourceQuery[2]];
                    if (resourceQuery[2] === "metrics") {
                        value = _.keys(value);
                    }
                    return value;
                });
                return _.map(_.flatten(values), function (value) {
                    return { text: value };
                });
            });
        }
        var metricsQuery = query.match(/^metrics\(([^\)]+?)\)/);
        if (metricsQuery) {
            try {
                req.method = 'GET';
                req.url = 'v1/resource/generic/' + self.templateSrv.replace(metricsQuery[1]);
            }
            catch (err) {
                return self.$q.reject(err);
            }
            return self._gnocchi_request(req).then(function (resource) {
                return _.map(Object.keys(resource["metrics"]), function (m) {
                    return { text: m };
                });
            });
        }
        return self.$q.when([]);
    };
    GnocchiDatasource.prototype.testDatasource = function () {
        var self = this;
        return self._gnocchi_request({ 'url': 'v1/resource' }).then(function () {
            return { status: "success", message: "Data source is working", title: "Success" };
        }, function (reason) {
            if (reason.status === 401) {
                return { status: "error", message: "Data source authentification fail", title: "Authentification error" };
            }
            else if (reason.message !== undefined && reason.message) {
                return { status: "error", message: reason.message, title: "Error" };
            }
            else {
                return { status: "error", message: reason || 'Unexpected error (is cors configured correctly ?)', title: "Error" };
            }
        });
    };
    ////////////////
    /// Query
    ////////////////
    GnocchiDatasource.prototype.buildQueryRequest = function (resource_type, resource_search) {
        var self = this;
        var resource_search_req;
        resource_type = resource_type || 'generic';
        if (resource_search.trim()[0] === '{') {
            resource_search_req = {
                url: 'v1/search/resource/' + resource_type,
                method: 'POST',
                data: resource_search,
            };
        }
        else {
            resource_search_req = {
                url: 'v1/search/resource/' + resource_type,
                method: 'POST',
                params: {
                    filter: resource_search,
                }
            };
        }
        return resource_search_req;
    };
    GnocchiDatasource.prototype.validateSearchTarget = function (target) {
        var self = this;
        return self._gnocchi_request(self.buildQueryRequest(target.resource_type, target.resource_search));
    };
    //////////////////////
    /// Utils
    //////////////////////
    GnocchiDatasource.prototype.validateTarget = function (target, syntax_only) {
        // FIXME(sileht): When syntax_only is false, we should do template interpolation
        var self = this;
        var mandatory = [];
        switch (target.queryMode) {
            case "metric":
                if (!target.metric_id) {
                    mandatory.push("Metric ID");
                }
                break;
            case "resource":
                if (!target.resource_id) {
                    mandatory.push("Resource ID");
                }
                if (!target.metric_name) {
                    mandatory.push("Metric name");
                }
                break;
            case "resource_aggregation":
            case "resource_search":
                if (!target.resource_search) {
                    mandatory.push("Query");
                }
                else if (target.resource_search.trim()[0] === '{') {
                    try {
                        angular.toJson(angular.fromJson(target.resource_search));
                    }
                    catch (err) {
                        mandatory.push("Query");
                    }
                }
                if (!target.metric_name) {
                    mandatory.push("Metric name");
                }
                break;
            default:
                break;
        }
        if (mandatory.length > 0) {
            return "Missing or invalid fields: " + mandatory.join(", ");
        }
        else if (syntax_only) {
            return;
        }
        switch (target.queryMode) {
            case "resource_aggregation":
            case "resource_search":
                self.validateSearchTarget(target).then(undefined, function (result) {
                    if (result) {
                        return result.message;
                    }
                    else {
                        return "Unexpected error";
                    }
                });
                return;
        }
        return;
    };
    GnocchiDatasource.prototype.sanitize_url = function (url) {
        if (url[url.length - 1] !== '/') {
            return url + '/';
        }
        else {
            return url;
        }
    };
    //////////////////////
    /// KEYSTONE STUFFS
    //////////////////////
    GnocchiDatasource.prototype._gnocchi_request = function (additional_options) {
        var self = this;
        var deferred = self.$q.defer();
        self._gnocchi_auth_request(deferred, function () {
            var options = {
                url: null,
                method: null,
                headers: null,
                withCredentials: self.withCredentials
            };
            angular.merge(options, additional_options);
            if (self.url) {
                options.url = self.url + options.url;
            }
            if (!options.method) {
                options.method = 'GET';
            }
            if (!options.headers) {
                options.headers = self.default_headers;
            }
            return self.backendSrv.datasourceRequest(options).then(function (response) {
                deferred.resolve(response.data);
            });
        }, true);
        return deferred.promise;
    };
    GnocchiDatasource.prototype._gnocchi_auth_request = function (deferred, callback, retry) {
        var self = this;
        if (self.keystone_endpoint !== null && self.url === null) {
            self._keystone_auth_request(deferred, callback);
        }
        else {
            callback().then(undefined, function (reason) {
                if (reason.status === undefined) {
                    reason.message = "Gnocchi error: No response status code, is CORS correctly configured ? (detail: " + reason + ")";
                    deferred.reject(reason);
                }
                else if (reason.status === 0) {
                    reason.message = "Gnocchi error: Connection failed";
                    deferred.reject(reason);
                }
                else if (reason.status === 401) {
                    if (self.keystone_endpoint !== null && retry) {
                        self._keystone_auth_request(deferred, callback);
                    }
                    else {
                        deferred.reject({ 'message': "Gnocchi authentication failure" });
                    }
                }
                else if (reason.status === 404 && reason.data !== undefined && reason.data.message !== undefined) {
                    reason.message = "Metric not found: " + reason.data.message.replace(/<[^>]+>/gm, ''); // Strip html tag
                    deferred.reject(reason);
                }
                else if (reason.status === 400 && reason.data !== undefined && reason.data.message !== undefined) {
                    reason.message = "Malformed query: " + reason.data.message.replace(/<[^>]+>/gm, ''); // Strip html tag
                    deferred.reject(reason);
                }
                else if (reason.status >= 300 && reason.data !== undefined && reason.data.message !== undefined) {
                    reason.message = 'Gnocchi error: ' + reason.data.message.replace(/<[^>]+>/gm, ''); // Strip html tag
                    deferred.reject(reason);
                }
                else if (reason.status) {
                    reason.message = 'Gnocchi error: ' + reason;
                    deferred.reject(reason);
                }
            });
        }
    };
    GnocchiDatasource.prototype._keystone_auth_request = function (deferred, callback) {
        var self = this;
        var options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            url: self.keystone_endpoint + 'v3/auth/tokens',
            data: {
                "auth": {
                    "identity": {
                        "methods": ["password"],
                        "password": {
                            "user": {
                                "name": self.username,
                                "password": self.password,
                                "domain": { "id": self.domain }
                            }
                        }
                    },
                    "scope": {
                        "project": {
                            "domain": { "id": self.domain },
                            "name": self.project,
                        }
                    }
                }
            }
        };
        self.backendSrv.datasourceRequest(options).then(function (result) {
            self.default_headers['X-Auth-Token'] = result.headers('X-Subject-Token');
            _.each(result.data['token']['catalog'], function (service) {
                if (service['type'] === 'metric') {
                    _.each(service['endpoints'], function (endpoint) {
                        if (endpoint['interface'] === 'public') {
                            self.url = self.sanitize_url(endpoint['url']);
                        }
                    });
                }
            });
            if (self.url) {
                self._gnocchi_auth_request(deferred, callback, false);
            }
            else {
                deferred.reject({ 'message': "'metric' endpoint not found in Keystone catalog" });
            }
        }, function (reason) {
            var message;
            if (reason.status === 0) {
                message = "Connection failed";
            }
            else {
                if (reason.status !== undefined) {
                    message = '(' + reason.status + ' ' + reason.statusText + ') ';
                    if (reason.data && reason.data.error) {
                        message += ' ' + reason.data.error.message;
                    }
                }
                else {
                    message = 'No response status code, is CORS correctly configured ?';
                }
            }
            deferred.reject({ 'message': 'Keystone failure: ' + message });
        });
    };
    return GnocchiDatasource;
}());
exports.default = GnocchiDatasource;
//# sourceMappingURL=datasource.js.map