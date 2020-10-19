"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var _ = require("lodash");
var angular = require("angular");
var moment = require("moment");
var GnocchiDatasource = /** @class */ (function () {
    function GnocchiDatasource(instanceSettings, $q, backendSrv, templateSrv) {
        this.$q = $q;
        this.backendSrv = backendSrv;
        this.templateSrv = templateSrv;
        this.type = 'gnocchi';
        this.GENERIC_ATTRIBUTES = ["created_by_project_id", "created_by_user_id", "creator",
            "ended_at", "id", "original_resource_id", "project_id",
            "revision_end", "revision_start", "started_at", "type", "user_id"];
        this.name = instanceSettings.name;
        this.supportMetrics = true;
        this.version = null;
        this.resource_types = [];
        this.NOT_FOUND = "none found";
        this.INVALID_QUERY = "-- invalid query --";
        this.default_headers = {
            'Content-Type': 'application/json',
        };
        this.keystone_endpoint = null;
        this.url = this.sanitize_url(instanceSettings.url);
        if (instanceSettings.jsonData) {
            this.auth_mode = instanceSettings.jsonData.mode;
            this.project = instanceSettings.jsonData.project;
            this.username = instanceSettings.jsonData.username;
            this.password = instanceSettings.jsonData.password;
            this.roles = instanceSettings.jsonData.roles;
            this.domain = instanceSettings.jsonData.domain;
            if (this.domain === undefined || this.domain === "") {
                this.domain = 'default';
            }
        }
        if (this.roles === undefined || this.roles === "") {
            this.roles = 'admin';
        }
        if (instanceSettings.basicAuth || instanceSettings.withCredentials) {
            this.withCredentials = true;
        }
        // If the URL starts with http, we are in direct mode
        if (instanceSettings.basicAuth) {
            this.default_headers["Authorization"] = instanceSettings.basicAuth;
        }
        else if (this.auth_mode === "token") {
            this.default_headers['X-Auth-Token'] = instanceSettings.jsonData.token;
        }
        else if (this.auth_mode === "noauth") {
            this.default_headers['X-Project-Id'] = this.project;
            this.default_headers['X-User-Id'] = this.username;
            this.default_headers['X-Domain-Id'] = this.domain;
            this.default_headers['X-Roles'] = this.roles;
        }
        else if (this.auth_mode === "keystone") {
            this.url = null;
            this.keystone_endpoint = this.sanitize_url(instanceSettings.jsonData.endpoint);
        }
    }
    ////////////////
    // Plugins API
    ////////////////
    GnocchiDatasource.prototype.query = function (options) {
        var _this = this;
        var targets = _.filter(options.targets, function (target) { return !target.hide; });
        var promises = _.map(targets, function (target) {
            // Ensure target is valid
            var default_measures_req = {
                url: null,
                data: null,
                method: null,
                params: {
                    'aggregation': null,
                    'reaggregation': null,
                    'start': options.range.from.toISOString(),
                    'end': null,
                    'stop': null,
                    'granularity': null,
                    'filter': null,
                    'needed_overlap': null,
                    'fill': null,
                    'details': null,
                    'groupby': null,
                    'metric': null
                }
            };
            if (options.range.to) {
                // NOTE(sileht): Gnocchi API looks inconsistente
                default_measures_req.params.end = options.range.to.toISOString();
                default_measures_req.params.stop = options.range.to.toISOString();
            }
            var resource_type = target.resource_type;
            var metric_regex;
            var resource_search;
            var resource_id;
            var metric_id;
            var user_label;
            var granularity;
            var operations;
            var groupby;
            try {
                if (!_this.checkMandatoryFields(target)) {
                    return _this.$q.when([]);
                }
                metric_regex = _this.templateSrv.replace(target.metric_name, options.scopedVars, 'regex');
                resource_search = _this.templateSrv.replace(target.resource_search, options.scopedVars, _this.formatQueryTemplate);
                operations = _this.templateSrv.replace(target.operations, options.scopedVars, _this.formatUnsupportedMultiValue("Operations"));
                resource_id = _this.templateSrv.replace(target.resource_id, options.scopedVars, _this.formatUnsupportedMultiValue("Resource ID"));
                metric_id = _this.templateSrv.replace(target.metric_id, options.scopedVars, _this.formatUnsupportedMultiValue("Metric ID"));
                user_label = _this.templateSrv.replace(target.label, options.scopedVars, _this.formatLabelTemplate);
                granularity = _this.templateSrv.replace(target.granularity, options.scopedVars, _this.formatUnsupportedMultiValue("Granularity"));
                groupby = _this.templateSrv.replace(target.groupby, options.scopedVars, _this.formatGroupBy);
                if ((target.queryMode === "resource_search" || target.queryMode === "resource_aggregation")
                    && _this.isJsonQuery(resource_search)) {
                    try {
                        angular.toJson(angular.fromJson(resource_search));
                    }
                    catch (err) {
                        throw { message: "Query JSON is malformed: " + err };
                    }
                }
            }
            catch (err) {
                return _this.$q.reject(err);
            }
            if (granularity) {
                default_measures_req.params.granularity = granularity;
            }
            if (target.queryMode !== "dynamic_aggregates") {
                default_measures_req.params.aggregation = target.aggregator;
            }
            /* DYNAMIC AGGREGATES */
            if (target.queryMode === "dynamic_aggregates") {
                default_measures_req.url = 'v1/aggregates';
                default_measures_req.method = 'POST';
                default_measures_req.params.fill = target.fill;
                default_measures_req.params.needed_overlap = target.needed_overlap;
                default_measures_req.params.details = 'true';
                if (groupby) {
                    default_measures_req.params.groupby = _.split(groupby, ',');
                }
                default_measures_req.data = {
                    'operations': operations
                };
                if (resource_search && resource_search.trim() !== "") {
                    default_measures_req.data['search'] = resource_search;
                    default_measures_req.data['resource_type'] = resource_type;
                }
                if (groupby) {
                    return _this._retrieve_aggregates_groupby(user_label || "unlabeled", default_measures_req);
                }
                else {
                    return _this._retrieve_aggregates(user_label || "unlabeled", default_measures_req);
                }
                /* RESOURCE GROUPBY */
            }
            else if (target.queryMode === "resource_aggregation" && target.groupby) {
                _this.ReqAddResourceQueryAttributes(default_measures_req, resource_type, resource_search);
                default_measures_req.url = "v1/aggregation/resource/" + resource_type + "/metric/" + target.metric_name;
                default_measures_req.params.groupby = _.split(groupby, ',');
                _this.ReqAddAggregationOptions(default_measures_req, target);
                return _this._retrieve_legacy_aggregation_groupby(user_label || "unlabeled", default_measures_req);
                /* RESOURCE SEARCH AND AGGREGATION */
            }
            else if (target.queryMode === "resource_search" || target.queryMode === "resource_aggregation") {
                var resource_search_req = { url: null, method: null, data: null, params: { filter: null } };
                _this.ReqAddResourceQueryAttributes(resource_search_req, resource_type, resource_search);
                return _this._gnocchi_request(resource_search_req).then(function (result) {
                    var re = new RegExp(metric_regex);
                    var metrics = {};
                    _.forEach(result, function (resource) {
                        _.forOwn(resource["metrics"], function (id, name) {
                            if (re.test(name)) {
                                metrics[id] = _this._compute_label(user_label, resource, name, target.aggregator);
                            }
                        });
                    });
                    if (target.queryMode === "resource_search") {
                        /* RESOURCE SEARCH */
                        return _this.$q.all(_.map(metrics, function (label, id) {
                            var measures_req = _.merge({}, default_measures_req);
                            measures_req.url = 'v1/metric/' + id + '/measures';
                            return _this._retrieve_measures(label, measures_req, target.draw_missing_datapoint_as_zero);
                        }));
                    }
                    else {
                        /* RESOURCE AGGREGATION */
                        var measures_req = _.merge({}, default_measures_req);
                        measures_req.url = 'v1/aggregation/metric';
                        measures_req.params.metric = _.keysIn(metrics);
                        _this.ReqAddAggregationOptions(measures_req, target);
                        // We don't pass draw_missing_datapoint_as_zero, this is done by fill
                        return _this._retrieve_measures(user_label || "unlabeled", measures_req, false);
                    }
                });
                /* RESOURCE */
            }
            else if (target.queryMode === "resource") {
                var resource_req = {
                    url: 'v1/resource/' + resource_type + '/' + resource_id,
                };
                return _this._gnocchi_request(resource_req).then(function (resource) {
                    var label = _this._compute_label(user_label, resource, metric_regex, target.aggregator);
                    default_measures_req.url = ('v1/resource/' + resource_type + '/' +
                        resource_id + '/metric/' + metric_regex + '/measures');
                    return _this._retrieve_measures(label, default_measures_req, target.draw_missing_datapoint_as_zero);
                });
                /* METRIC */
            }
            else if (target.queryMode === "metric") {
                var metric_req = {
                    url: 'v1/metric/' + metric_id,
                };
                return _this._gnocchi_request(metric_req).then(function (metric) {
                    var label;
                    if (user_label) {
                        // NOTE(sileht): The resource returned is currently incomplete
                        // https://github.com/gnocchixyz/gnocchi/issues/310
                        label = _this._compute_label(user_label, metric['resource'], metric["name"], target.aggregator);
                    }
                    else {
                        label = metric_id;
                    }
                    default_measures_req.url = 'v1/metric/' + metric_id + '/measures';
                    return _this._retrieve_measures(label, default_measures_req, target.draw_missing_datapoint_as_zero);
                });
            }
        });
        return this.$q.all(promises).then(function (results) {
            return { data: _.flattenDeep(results) };
        });
    };
    //////////////////////
    /// Measures helpers
    //////////////////////
    GnocchiDatasource.prototype._retrieve_measures = function (label, reqs, draw_missing_datapoint_as_zero) {
        var _this = this;
        return this._gnocchi_request(reqs).then(function (result) {
            return _this._parse_measures(label, result, draw_missing_datapoint_as_zero);
        });
    };
    GnocchiDatasource.prototype._retrieve_aggregates = function (user_label, reqs) {
        var _this = this;
        return this._gnocchi_request(reqs).then(function (result) {
            if (reqs.data.search === undefined) {
                var metrics = {};
                _.forEach(result['references'], function (metric) {
                    metrics[metric["id"]] = metric;
                });
                return _.map(Object.keys(result["measures"]), function (mid) {
                    if (mid === "aggregated") {
                        var label = _this._compute_label(user_label, null, "aggregated", "");
                        return _this._parse_measures(label, result["measures"]["aggregated"], false);
                    }
                    else {
                        return _.map(Object.keys(result["measures"][mid]), function (agg) {
                            var label = _this._compute_label(user_label, null, mid, agg);
                            return _this._parse_measures(label, result["measures"][mid][agg], false);
                        });
                    }
                });
            }
            else {
                var resources = {};
                _.forEach(result['references'], function (resource) {
                    resources[resource["id"]] = resource;
                });
                return _.map(Object.keys(result["measures"]), function (rid) {
                    if (rid === "aggregated") {
                        var label = _this._compute_label(user_label, null, "aggregated", "");
                        return _this._parse_measures(label, result["measures"]["aggregated"], false);
                    }
                    else {
                        return _.map(Object.keys(result["measures"][rid]), function (metric_name) {
                            return _.map(Object.keys(result["measures"][rid][metric_name]), function (agg) {
                                var label = _this._compute_label(user_label, resources[rid], metric_name, agg);
                                return _this._parse_measures(label, result["measures"][rid][metric_name][agg], false);
                            });
                        });
                    }
                });
            }
        });
    };
    GnocchiDatasource.prototype._retrieve_legacy_aggregation_groupby = function (user_label, reqs) {
        var _this = this;
        return this._gnocchi_request(reqs).then(function (result) {
            return _.map(result, function (group) {
                var label = _this._compute_label(user_label, group["group"], "aggregated", "");
                return _this._parse_measures(label, group["measures"], false);
            });
        });
    };
    GnocchiDatasource.prototype._retrieve_aggregates_groupby = function (user_label, reqs) {
        var _this = this;
        return this._gnocchi_request(reqs).then(function (result) {
            return _.map(result, function (group) {
                var measures = group["measures"]["measures"];
                var resources = {};
                _.forEach(group["measures"]['references'], function (resource) {
                    resources[resource["id"]] = resource;
                });
                return _.map(Object.keys(measures), function (rid) {
                    if (rid === "aggregated") {
                        var label = _this._compute_label(user_label, group["group"], "aggregated", "");
                        return _this._parse_measures(label, measures["aggregated"], false);
                    }
                    else {
                        return _.map(Object.keys(measures[rid]), function (metric_name) {
                            return _.map(Object.keys(measures[rid][metric_name]), function (agg) {
                                var label = _this._compute_label(user_label, resources[rid], metric_name, agg);
                                return _this._parse_measures(label, measures[rid][metric_name][agg], false);
                            });
                        });
                    }
                });
            });
        });
    };
    GnocchiDatasource.prototype._parse_measures = function (name, measures, draw_missing_datapoint_as_zero) {
        var dps = [];
        var last_granularity;
        var last_timestamp;
        var last_value;
        // NOTE(sileht): sample are ordered by granularity, then timestamp.
        _.each(_.toArray(measures).reverse(), function (metricData) {
            var granularity = metricData[1];
            var timestamp = moment(metricData[0], moment.ISO_8601);
            var value = metricData[2];
            if (last_timestamp !== undefined) {
                // We have a more precise granularity
                if (timestamp.valueOf() >= last_timestamp.valueOf()) {
                    return;
                }
                if (draw_missing_datapoint_as_zero) {
                    var c_timestamp = last_timestamp;
                    c_timestamp.subtract(last_granularity, "seconds");
                    while (timestamp.valueOf() < c_timestamp.valueOf()) {
                        dps.push([0, c_timestamp.valueOf()]);
                        c_timestamp.subtract(last_granularity, "seconds");
                    }
                }
            }
            last_timestamp = timestamp;
            last_granularity = granularity;
            last_value = value;
            dps.push([last_value, last_timestamp.valueOf()]);
        });
        return { target: name, datapoints: _.toArray(dps).reverse() };
    };
    GnocchiDatasource.prototype._compute_label = function (label, resource, metric, aggregation) {
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
            res = res.replace("$aggregation", aggregation);
            res = res.replace("${aggregation}", aggregation);
            res = res.replace("$aggregator", aggregation);
            res = res.replace("${aggregator}", aggregation);
            return res;
        }
        else {
            return ((resource) ? resource["id"] : "no label");
        }
    };
    /////////////////////////
    /// Completion queries
    /////////////////////////
    GnocchiDatasource.prototype.getCompletionsCacheForResourceAttributeValue = function (resource_type, attr) {
        var req = { url: null, method: null, data: null, params: { filter: null, attrs: attr } };
        this.ReqAddResourceQueryAttributes(req, resource_type, "{}");
        return this._gnocchi_request(req).then(function (resources) {
            return _.map(resources, function (r) {
                return r[attr];
            });
        });
    };
    GnocchiDatasource.prototype.getCompletionsCacheForResource = function (resources, metric_regex) {
        var _this = this;
        var re = new RegExp(metric_regex);
        var all_metrics = [];
        var match_metrics = [];
        _.forEach(resources, function (resource) {
            _.forOwn(resource["metrics"], function (id, name) {
                all_metrics.push(name);
                if (re.test(name)) {
                    match_metrics.push(id);
                }
            });
        });
        all_metrics.sort();
        if (!metric_regex) {
            return {
                resources: resources,
                metrics: _.sortedUniq(all_metrics),
                aggregators: [this.NOT_FOUND],
            };
        }
        return this.$q.all(_.map(_.sortedUniq(match_metrics), function (metric) {
            return _this._gnocchi_request({ url: 'v1/metric/' + metric });
        })).then(function (metric_objs) {
            var aggregators = _.flattenDeep(_.map(metric_objs, function (metric) {
                return metric["archive_policy"]["aggregation_methods"];
            }));
            aggregators.sort();
            if (aggregators.length === 0) {
                aggregators.push(_this.NOT_FOUND);
            }
            if (all_metrics.length === 0) {
                all_metrics.push(_this.NOT_FOUND);
            }
            return {
                resources: resources,
                metrics: _.sortedUniq(all_metrics),
                aggregators: _.sortedUniq(aggregators)
            };
        });
    };
    GnocchiDatasource.prototype.getCompletionsCache = function (target, cached_resources) {
        var _this = this;
        /* METRIC */
        if (target.queryMode === "metric" && target.metric_id) {
            var fake_resource = { "metrics": { "fake": target.metric_id } };
            return this.getCompletionsCacheForResource([fake_resource], 'fake');
            /* RESOURCE */
        }
        else if (target.queryMode === "resource" && target.resource_id) {
            if (cached_resources) {
                return this.getCompletionsCacheForResource(cached_resources, "^" + target.metric_name + "$");
            }
            else {
                return this._gnocchi_request({ url: 'v1/resource/generic/' + target.resource_id }).then(function (result) {
                    return _this.getCompletionsCacheForResource([result], "^" + target.metric_name + "$");
                }, function () {
                    return _this.getCompletionsCacheForResource([], "^" + target.metric_name + "$");
                });
            }
            /* AGGREGATION */
        }
        else if (target.resource_search) {
            var metric_regex = this.templateSrv.replace(target.metric_name, {}, 'regex');
            if (target.queryMode === "dynamic_aggregates") {
                metric_regex = null;
            }
            if (cached_resources) {
                return this.getCompletionsCacheForResource(cached_resources, metric_regex);
            }
            else {
                var req = { url: null, method: null, data: null, params: { filter: null } };
                var resource_search = this.templateSrv.replace(target.resource_search, {}, this.formatQueryTemplate);
                this.ReqAddResourceQueryAttributes(req, target.resource_type, resource_search);
                return this._gnocchi_request(req).then(function (result) {
                    return _this.getCompletionsCacheForResource(result, metric_regex);
                }, function () {
                    return _this.getCompletionsCacheForResource([], metric_regex);
                });
            }
        }
        else {
            return this.$q.when({
                resources: [],
                metrics: [this.NOT_FOUND],
                aggregators: [this.NOT_FOUND],
            });
        }
    };
    GnocchiDatasource.prototype.metricFindQuery = function (query) {
        var _this = this;
        var req = { method: 'POST', url: null, data: null, params: { filter: null, attrs: null } };
        var resource_type;
        var display_attribute;
        var value_attribute;
        var resource_search;
        var resourceQuery = query.match(/^resources\(([^,]*),\s?([^,]*),\s?([^,]+?),\s?([^\)]+?)\)/);
        if (resourceQuery) {
            resource_type = resourceQuery[1];
            display_attribute = resourceQuery[2];
            value_attribute = resourceQuery[3];
            resource_search = resourceQuery[4];
        }
        else {
            // NOTE(sileht): try legacy format
            resourceQuery = query.match(/^resources\(([^,]*),\s?([^,]*),\s?([^\)]+?)\)/);
            if (resourceQuery) {
                resource_type = resourceQuery[1];
                display_attribute = "$" + resourceQuery[2];
                value_attribute = resourceQuery[2];
                resource_search = resourceQuery[3];
            }
        }
        if (resourceQuery) {
            if (value_attribute.charAt(0) === '$') {
                value_attribute = value_attribute.slice(1);
            }
            try {
                req.url = this.templateSrv.replace('v1/search/resource/' + resource_type);
                resource_search = this.templateSrv.replace(resource_search, {}, this.formatQueryTemplate);
                if (this.isJsonQuery(resource_search)) {
                    angular.toJson(angular.fromJson(resource_search));
                }
            }
            catch (err) {
                return this.$q.reject(err);
            }
            if (this.isJsonQuery(resource_search)) {
                req.data = resource_search;
            }
            else {
                req.params.filter = resource_search;
            }
            var parseResponse = function (result) {
                if (value_attribute === "metrics") {
                    return _.flatten(_.map(result, function (resource) {
                        return _this._gnocchi_request(req).then(function (result) {
                            return _.flatten(_.map(result, function (resource) {
                                return _.keys(resource["metrics"]);
                            }));
                        });
                    }));
                }
                else {
                    return _.map(result, function (resource) {
                        var display = _this._compute_label(display_attribute, resource, "unknown", "none");
                        var value = resource[value_attribute];
                        return { text: display, value: value };
                    });
                }
            };
            return this.requireVersion("4.2.0").then(function () {
                // Assume that gnocchi 4.2.0 recognizes attrs parameter
                req.params.attrs = _this.buildAttributeParam(value_attribute, display_attribute);
                return _this._gnocchi_request(req).then(parseResponse);
            }).catch(function () {
                return _this._gnocchi_request(req).then(parseResponse);
            });
        }
        var metricsQuery = query.match(/^metrics\(([^\)]+?)\)/);
        if (metricsQuery) {
            try {
                req.method = 'GET';
                req.url = 'v1/resource/generic/' + this.templateSrv.replace(metricsQuery[1]);
            }
            catch (err) {
                return this.$q.reject(err);
            }
            return this._gnocchi_request(req).then(function (resource) {
                return _.map(Object.keys(resource["metrics"]), function (m) {
                    return { text: m };
                });
            });
        }
        return this.$q.when([]);
    };
    ////////////////////////////
    /// Datasource validation
    ////////////////////////////
    GnocchiDatasource.prototype.testDatasource = function () {
        return this._gnocchi_request({ 'url': 'v1/resource' }).then(function () {
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
    GnocchiDatasource.prototype.ReqAddAggregationOptions = function (base_request, target) {
        if (target.reaggregator !== "none") {
            base_request.params.reaggregation = target.reaggregator;
        }
        else {
            base_request.params.reaggregation = null;
        }
        base_request.params.fill = target.fill;
        if (target.needed_overlap === undefined) {
            base_request.params.needed_overlap = 0;
        }
        else {
            base_request.params.needed_overlap = target.needed_overlap;
        }
    };
    GnocchiDatasource.prototype.ReqAddResourceQueryAttributes = function (base_request, resource_type, resource_search) {
        var resource_search_req;
        if (this.isJsonQuery(resource_search)) {
            base_request.url = 'v1/search/resource/' + resource_type;
            base_request.method = 'POST';
            base_request.data = resource_search;
        }
        else {
            base_request.url = 'v1/search/resource/' + resource_type;
            base_request.method = 'POST';
            base_request.params.filter = resource_search;
        }
    };
    //////////////////////
    /// Utils
    //////////////////////
    GnocchiDatasource.prototype.getResourceTypes = function () {
        var _this = this;
        var deferred = this.$q.defer();
        if (this.resource_types.length === 0) {
            this.resource_types = {};
            this._gnocchi_request({ url: 'v1/resource_type' }).then(function (result) {
                _this.resource_types = result;
                deferred.resolve(_this.resource_types);
            });
        }
        else {
            deferred.resolve(this.resource_types);
        }
        return deferred.promise;
    };
    GnocchiDatasource.prototype.requireVersion = function (version) {
        var _this = this;
        // this.version is a sum of 3 int where:
        // major  * 1000000
        // minor  * 1000
        // fix    * 1
        var deferred = this.$q.defer();
        version = this.parseVersion(version);
        if (this.version === null) {
            this._gnocchi_request({ 'url': '' }).then(function (result) {
                console.log("Gnocchi build: " + result.build);
                if (result.build !== undefined) {
                    _this.version = _this.parseVersion(result.build);
                }
                else {
                    // Assume 3.1.0
                    _this.version = 300010000;
                }
                if (_this.version >= version) {
                    deferred.resolve();
                }
                else {
                    deferred.reject();
                }
            });
        }
        else if (this.version >= version) {
            deferred.resolve();
        }
        else {
            deferred.reject();
        }
        return deferred.promise;
    };
    GnocchiDatasource.prototype.parseVersion = function (version) {
        var v = version.split(".");
        var major = parseInt(v[0]);
        var minor = parseInt(v[1]);
        var fix = parseInt(v[2]);
        if (major !== null && minor !== null && fix !== null) {
            return major * 1000000 + minor * 1000 + fix;
        }
        else {
            // Assume 3.1.0
            console.log("Gnocchi version unparsable: " + version);
            return 300010000;
        }
    };
    GnocchiDatasource.prototype.formatUnsupportedMultiValue = function (field) {
        return function (value, variable, formater) {
            if (typeof value === 'string') {
                return value;
            }
            else if (value.length > 1) {
                throw { message: "Templating multi value in '" + field + "' is unsupported" };
            }
            else {
                return value[0];
            }
        };
    };
    GnocchiDatasource.prototype.formatLabelTemplate = function (value, variable, formater) {
        if (typeof value === 'string') {
            return value;
        }
        else {
            return value[0];
        }
    };
    GnocchiDatasource.prototype.formatGroupBy = function (value, variable, formater) {
        if (typeof value === 'string') {
            return value;
        }
        else {
            return value.join(",");
        }
    };
    GnocchiDatasource.prototype.formatQueryTemplate = function (value, variable, formater) {
        if (typeof value === 'string') {
            return value;
        }
        else {
            var values = _.map(value, function (v) {
                return '"' + v.replace('"', '\"') + '"';
            });
            return "[" + values.join(", ") + "]";
        }
    };
    GnocchiDatasource.prototype.isJsonQuery = function (query) {
        return query.trim()[0] === '{';
    };
    GnocchiDatasource.prototype.checkMandatoryFields = function (target) {
        // NOTE(sileht): double seatbelt, we may remove it when the query_ctrl will be more robust
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
                    mandatory.push("Metric regex");
                }
                if (!target.aggregator || target.aggregator === this.NOT_FOUND) {
                    mandatory.push("Aggregator");
                }
                break;
            case "dynamic_aggregates":
                if (!target.operations) {
                    mandatory.push("Operations");
                }
                break;
            case "resource_aggregation":
            case "resource_search":
                if (!target.resource_search) {
                    mandatory.push("Query");
                }
                if (!target.metric_name) {
                    mandatory.push("Metric regex");
                }
                if (!target.aggregator || target.aggregator === this.NOT_FOUND) {
                    mandatory.push("Aggregator");
                }
                break;
            default:
                break;
        }
        return (mandatory.length === 0);
    };
    GnocchiDatasource.prototype.sanitize_url = function (url) {
        if (url[url.length - 1] !== '/') {
            return url + '/';
        }
        else {
            return url;
        }
    };
    GnocchiDatasource.prototype.buildAttributeParam = function (value_attribute, display_attribute) {
        var m1 = _.map(display_attribute.match(/\$[^\$\s{}]+/g) || [], function (name) {
            return name.slice(1);
        });
        var m2 = _.map(display_attribute.match(/\${[^\$\s{}]+}/g) || [], function (name) {
            return name.slice(2, -1);
        });
        return _.uniq(m1.concat(m2).concat([value_attribute]));
    };
    //////////////////////
    /// KEYSTONE STUFFS
    //////////////////////
    GnocchiDatasource.prototype._gnocchi_request = function (additional_options) {
        var _this = this;
        var deferred = this.$q.defer();
        this._gnocchi_auth_request(deferred, function () {
            var options = {
                url: null,
                method: null,
                headers: null,
                withCredentials: _this.withCredentials
            };
            angular.merge(options, additional_options);
            if (_this.url) {
                options.url = _this.url + options.url;
            }
            if (!options.method) {
                options.method = 'GET';
            }
            if (!options.headers) {
                options.headers = _this.default_headers;
            }
            return _this.backendSrv.datasourceRequest(options).then(function (response) {
                deferred.resolve(response.data);
            });
        }, true);
        return deferred.promise;
    };
    GnocchiDatasource.prototype._gnocchi_auth_request = function (deferred, callback, retry) {
        var _this = this;
        if (this.keystone_endpoint !== null && this.url === null) {
            this._keystone_auth_request(deferred, callback);
        }
        else {
            callback().then(undefined, function (reason) {
                if (reason.status === undefined) {
                    reason.message = "Gnocchi is unreachable or CORS is misconfigured (detail: " + reason + ")";
                    deferred.reject(reason);
                }
                else if (reason.status === 0) {
                    reason.message = "Gnocchi connection failed";
                    deferred.reject(reason);
                }
                else if (reason.status === 401) {
                    if (_this.keystone_endpoint !== null && retry) {
                        _this._keystone_auth_request(deferred, callback);
                    }
                    else {
                        deferred.reject({ 'message': "Gnocchi authentication failure" });
                    }
                }
                else if (reason.data !== undefined && reason.data.message !== undefined) {
                    if (reason.status >= 300 && reason.status < 500) {
                        // Remove pecan generic message, replace <br> by \n, strip other html tag
                        reason.data.message = reason.data.message.replace(/[^<]*<br \/><br \/>/gm, '');
                        reason.data.message = reason.data.message.replace('<br />', '\n').replace(/<[^>]+>/gm, '').trim();
                        deferred.reject(reason);
                    }
                }
                else {
                    deferred.reject(reason);
                }
            });
        }
    };
    GnocchiDatasource.prototype._keystone_auth_request = function (deferred, callback) {
        var _this = this;
        var options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            url: this.keystone_endpoint + 'v3/auth/tokens',
            data: {
                "auth": {
                    "identity": {
                        "methods": ["password"],
                        "password": {
                            "user": {
                                "name": this.username,
                                "password": this.password,
                                "domain": { "id": this.domain }
                            }
                        }
                    },
                    "scope": {
                        "project": {
                            "domain": { "id": this.domain },
                            "name": this.project,
                        }
                    }
                }
            }
        };
        this.backendSrv.datasourceRequest(options).then(function (result) {
            _this.default_headers['X-Auth-Token'] = result.headers('X-Subject-Token');
            _.each(result.data['token']['catalog'], function (service) {
                if (service['type'] === 'metric') {
                    _.each(service['endpoints'], function (endpoint) {
                        if (endpoint['interface'] === 'public') {
                            _this.url = _this.sanitize_url(endpoint['url']);
                        }
                    });
                }
            });
            if (_this.url) {
                _this._gnocchi_auth_request(deferred, callback, false);
            }
            else {
                deferred.reject({ 'message': "'metric' endpoint not found in Keystone catalog" });
            }
        }, function (reason) {
            var message;
            if (reason.status === 0) {
                message = "Keystone connection failed";
            }
            else {
                if (reason.status !== undefined) {
                    message = 'Keystone error: (' + reason.status + ' ' + reason.statusText + ') ';
                    if (reason.data && reason.data.error) {
                        message += ' ' + reason.data.error.message;
                    }
                }
                else {
                    message = 'Keystone is unreachable or CORS is misconfigured.';
                }
            }
            deferred.reject({ 'message': message });
        });
    };
    return GnocchiDatasource;
}());
exports.GnocchiDatasource = GnocchiDatasource;
//# sourceMappingURL=datasource.js.map