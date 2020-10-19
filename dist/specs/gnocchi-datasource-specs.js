"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var module_1 = require("../module");
var backendsrv_1 = require("./mocks/backendsrv");
var templatesrv_1 = require("./mocks/templatesrv");
var moment = require("moment");
var angular = require("angular");
describe('GnocchiDatasource', function () {
    var ds = null;
    var $q = null;
    var $httpBackend = null;
    var backendSrv = null;
    var templateSrv = null;
    var results = null;
    beforeEach(angular.mock.inject(function ($injector) {
        $q = $injector.get("$q");
        $httpBackend = $injector.get('$httpBackend');
        backendSrv = new backendsrv_1.default($injector.get('$http'));
        templateSrv = new templatesrv_1.default();
        ds = new module_1.Datasource({ url: [''], jsonData: { token: 'XXXXXXXXXXXXX', 'mode': 'token' } }, $q, backendSrv, templateSrv);
    }));
    afterEach(function () {
        $httpBackend.verifyNoOutstandingExpectation();
        $httpBackend.verifyNoOutstandingRequest();
    });
    function assert_simple_test(targets, method, url, data, label, pre_assert, post_assert) {
        var query = {
            range: { from: moment.utc([2014, 3, 10, 3, 20, 10]), to: moment.utc([2014, 3, 20, 3, 20, 10]) },
            targets: targets,
            interval: '1s'
        };
        var headers = { "X-Auth-Token": "XXXXXXXXXXXXX", "Accept": "application/json, text/plain, */*",
            "Content-Type": "application/json" };
        it('should return series list', angular.mock.inject(function () {
            if (pre_assert) {
                pre_assert();
            }
            $httpBackend.expect(method, url, data, headers).respond([
                ["2014-10-06T14:00:00+00:00", "600.0", "7"],
                ["2014-10-06T14:20:00+00:00", "600.0", "5"],
                ["2014-10-06T14:33:00+00:00", "60.0", "43.1"],
                ["2014-10-06T14:34:00+00:00", "60.0", "12"],
                ["2014-10-06T14:36:00+00:00", "60.0", "2"]
            ]);
            if (post_assert) {
                post_assert();
            }
            ds.query(query).then(function (data) {
                results = data;
            });
            $httpBackend.flush();
            expect(results.data.length).to.be(1);
            expect(results.data[0].target).to.be(label);
            expect(results.data[0].datapoints).to.eql([
                ['7', 1412604000000],
                [0, 1412604600000],
                ['5', 1412605200000],
                [0, 1412605260000],
                [0, 1412605320000],
                [0, 1412605380000],
                [0, 1412605440000],
                [0, 1412605500000],
                [0, 1412605560000],
                [0, 1412605620000],
                [0, 1412605680000],
                [0, 1412605740000],
                [0, 1412605800000],
                [0, 1412605860000],
                [0, 1412605920000],
                ['43.1', 1412605980000],
                ['12', 1412606040000],
                [0, 1412606100000],
                ['2', 1412606160000]
            ]);
        }));
    }
    describe('Resource', function () {
        assert_simple_test([{ queryMode: 'resource', resource_type: 'instance', resource_id: 'my_uuid', metric_name: 'cpu_util', aggregator: 'max',
                draw_missing_datapoint_as_zero: true }], 'GET', "/v1/resource/instance/my_uuid/metric/cpu_util/measures?" +
            "aggregation=max&end=2014-04-20T03:20:10.000Z&start=2014-04-10T03:20:10.000Z&stop=2014-04-20T03:20:10.000Z", null, '6868da77-fa82-4e67-aba9-270c5ae8cbca', function () {
            $httpBackend.expect("GET", "/v1/resource/instance/my_uuid").respond({
                "display_name": "myfirstvm",
                "id": "6868da77-fa82-4e67-aba9-270c5ae8cbca",
            });
        }, null);
    });
    describe('MetricFindQuery resources() query', function () {
        var url_expected_search_resources = "/v1/search/resource/instance?attrs=id&attrs=display_name" +
            "&filter=server_group%3D'autoscaling_group'";
        var response_search_resources = [
            {
                "display_name": "myfirstvm",
                "id": "6868da77-fa82-4e67-aba9-270c5ae8cbca",
            },
            {
                "display_name": "mysecondvm",
                "id": "f898ba55-bbea-460f-985c-3d1243348304",
            }
        ];
        var results;
        beforeEach(function () {
            $httpBackend.expect('GET', "/").respond({ "build": "4.2.0" });
            $httpBackend.expect('POST', url_expected_search_resources).respond(response_search_resources);
            ds.metricFindQuery("resources(instance, $id - $display_name, id, server_group='autoscaling_group')").then(function (data) { results = data; });
            $httpBackend.flush();
        });
        it("nothing more", function () {
            $httpBackend.verifyNoOutstandingExpectation();
            $httpBackend.verifyNoOutstandingRequest();
        });
        it('should return series list', function () {
            expect(results.length).to.be(2);
            expect(results[0].text).to.be('6868da77-fa82-4e67-aba9-270c5ae8cbca - myfirstvm');
            expect(results[1].text).to.be('f898ba55-bbea-460f-985c-3d1243348304 - mysecondvm');
            expect(results[0].value).to.be('6868da77-fa82-4e67-aba9-270c5ae8cbca');
            expect(results[1].value).to.be('f898ba55-bbea-460f-985c-3d1243348304');
        });
    });
    describe('MetricFindQuery resources() legacy query', function () {
        var url_expected_search_resources = "/v1/search/resource/instance?attrs=display_name&filter=server_group%3D'autoscaling_group'";
        var response_search_resources = [
            {
                "display_name": "myfirstvm"
            },
            {
                "display_name": "mysecondvm"
            }
        ];
        var results;
        beforeEach(function () {
            $httpBackend.expect('GET', "/").respond({ "build": "4.2.0" });
            $httpBackend.expect('POST', url_expected_search_resources).respond(response_search_resources);
            ds.metricFindQuery("resources(instance, display_name, server_group='autoscaling_group')").then(function (data) { results = data; });
            $httpBackend.flush();
        });
        it("nothing more", function () {
            $httpBackend.verifyNoOutstandingExpectation();
            $httpBackend.verifyNoOutstandingRequest();
        });
        it('should return series list', function () {
            expect(results.length).to.be(2);
            expect(results[0].text).to.be('myfirstvm');
            expect(results[1].text).to.be('mysecondvm');
        });
    });
    describe('Metric zero', function () {
        var query = {
            range: { from: moment.utc([2014, 3, 10, 3, 20, 10]), to: moment.utc([2014, 3, 20, 3, 20, 10]) },
            targets: [{ queryMode: 'metric', metric_id: 'my_uuid', aggregator: 'max', label: '$type',
                    draw_missing_datapoint_as_zero: true }],
            interval: '1s'
        };
        var url_expected_metric = '/v1/metric/my_uuid';
        var response_metric = {
            "id": "my_uuid",
            "name": "foobar",
            "resource": {
                "id": "6868da77-fa82-4e67-aba9-270c5ae8cbca",
                "type": "instance",
            }
        };
        var url_expected_measure = '/v1/metric/my_uuid/measures?aggregation=max&end=2014-04-20T03:20:10.000Z&start=2014-04-10T03:20:10.000Z' +
            '&stop=2014-04-20T03:20:10.000Z';
        var response_measure = [
            ["2014-10-06T14:00:00+00:00", "600.0", "7"],
            ["2014-10-06T14:20:00+00:00", "600.0", "5"],
            ["2014-10-06T14:33:00+00:00", "60.0", "43.1"],
            ["2014-10-06T14:34:00+00:00", "60.0", "12"],
            ["2014-10-06T14:36:00+00:00", "60.0", "2"]
        ];
        var results;
        beforeEach(function () {
            $httpBackend.expect('GET', url_expected_metric).respond(response_metric);
            $httpBackend.expect('GET', url_expected_measure).respond(response_measure);
            ds.query(query).then(function (data) { results = data; });
            $httpBackend.flush();
        });
        it("nothing more", function () {
            $httpBackend.verifyNoOutstandingExpectation();
            $httpBackend.verifyNoOutstandingRequest();
        });
        it('should return series list', function () {
            expect(results.data.length).to.be(1);
            expect(results.data[0].target).to.be('instance');
            expect(results.data[0].datapoints).to.eql([
                ['7', 1412604000000],
                [0, 1412604600000],
                ['5', 1412605200000],
                [0, 1412605260000],
                [0, 1412605320000],
                [0, 1412605380000],
                [0, 1412605440000],
                [0, 1412605500000],
                [0, 1412605560000],
                [0, 1412605620000],
                [0, 1412605680000],
                [0, 1412605740000],
                [0, 1412605800000],
                [0, 1412605860000],
                [0, 1412605920000],
                ['43.1', 1412605980000],
                ['12', 1412606040000],
                [0, 1412606100000],
                ['2', 1412606160000]
            ]);
        });
    });
    describe('Metric no zero', function () {
        var query = {
            range: { from: moment.utc([2014, 3, 10, 3, 20, 10]), to: moment.utc([2014, 3, 20, 3, 20, 10]) },
            targets: [{ queryMode: 'metric', metric_id: 'my_uuid', aggregator: 'max', label: '$type',
                    draw_missing_datapoint_as_zero: false }],
            interval: '1s'
        };
        var url_expected_metric = '/v1/metric/my_uuid';
        var response_metric = {
            "id": "my_uuid",
            "name": "foobar",
            "resource": {
                "id": "6868da77-fa82-4e67-aba9-270c5ae8cbca",
                "type": "instance",
            }
        };
        var url_expected_measure = '/v1/metric/my_uuid/measures?aggregation=max&end=2014-04-20T03:20:10.000Z&start=2014-04-10T03:20:10.000Z' +
            '&stop=2014-04-20T03:20:10.000Z';
        var response_measure = [
            ["2014-10-06T14:00:00+00:00", "600.0", "7"],
            ["2014-10-06T14:20:00+00:00", "600.0", "5"],
            ["2014-10-06T14:33:00+00:00", "60.0", "43.1"],
            ["2014-10-06T14:34:00+00:00", "60.0", "12"],
            ["2014-10-06T14:36:00+00:00", "60.0", "2"]
        ];
        var results;
        beforeEach(function () {
            $httpBackend.expect('GET', url_expected_metric).respond(response_metric);
            $httpBackend.expect('GET', url_expected_measure).respond(response_measure);
            ds.query(query).then(function (data) { results = data; });
            $httpBackend.flush();
        });
        it("nothing more", function () {
            $httpBackend.verifyNoOutstandingExpectation();
            $httpBackend.verifyNoOutstandingRequest();
        });
        it('should return series list', function () {
            expect(results.data.length).to.be(1);
            expect(results.data[0].target).to.be('instance');
            expect(results.data[0].datapoints).to.eql([
                ['7', 1412604000000],
                ['5', 1412605200000],
                ['43.1', 1412605980000],
                ['12', 1412606040000],
                ['2', 1412606160000]
            ]);
        });
    });
    describe('Resource aggregation', function () {
        var query = {
            range: { from: moment.utc([2014, 3, 10, 3, 20, 10]), to: moment.utc([2014, 3, 20, 3, 20, 10]) },
            targets: [{ hide: false, queryMode: 'resource_aggregation', resource_search: '{"=": {"server_group": "autoscalig_group"}}',
                    resource_type: 'instance', label: 'mylabel', metric_name: 'cpu_.*', aggregator: 'max' }],
            interval: '1s'
        };
        var url_expected_search_resources = "/v1/search/resource/instance";
        var response_search_resources = [
            {
                "display_name": "myfirstvm",
                "host": "compute1",
                "id": "6868da77-fa82-4e67-aba9-270c5ae8cbca",
                "image_ref": "http://image",
                "type": "instance",
                "server_group": "autoscalig_group",
                "metrics": { "cpu_util": "1634173a-e3b8-4119-9eba-fa9a4d971c3b",
                    "notcpu": "4d7c72a4-adc1-4fc1-b1f7-27b35a7b5f95" }
            },
            {
                "display_name": "mysecondvm",
                "host": "compute1",
                "id": "f898ba55-bbea-460f-985c-3d1243348304",
                "image_ref": "http://image",
                "type": "instance",
                "server_group": "autoscalig_group",
                "metrics": { "cpu_util": "58b233f4-65ba-4aeb-97ba-b8bc0feec97e",
                    "cpu_time": "6ff95458-97b4-4b08-af03-7d18b05d277e" }
            }
        ];
        var url_expected_get_measures = "/v1/aggregation/metric?metric=1634173a-e3b8-4119-9eba-fa9a4d971c3b&" +
            "metric=58b233f4-65ba-4aeb-97ba-b8bc0feec97e&metric=6ff95458-97b4-4b08-af03-7d18b05d277e&" +
            "needed_overlap=0&" +
            "aggregation=max&end=2014-04-20T03:20:10.000Z&start=2014-04-10T03:20:10.000Z&stop=2014-04-20T03:20:10.000Z";
        var response_get_measures = [
            ["2014-10-06T14:33:57+00:00", "60.0", "43.1"],
            ["2014-10-06T14:34:12+00:00", "60.0", "12"],
            ["2014-10-06T14:34:20+00:00", "60.0", "2"],
        ];
        var results;
        beforeEach(function () {
            $httpBackend.expect('POST', url_expected_search_resources).respond(response_search_resources);
            $httpBackend.expect('GET', url_expected_get_measures).respond(response_get_measures);
            ds.query(query).then(function (data) { results = data; });
            $httpBackend.flush();
        });
        it("nothing more", function () {
            $httpBackend.verifyNoOutstandingExpectation();
            $httpBackend.verifyNoOutstandingRequest();
        });
        it('should return series list', function () {
            expect(results.data.length).to.be(1);
            expect(results.data[0].target).to.be('mylabel');
            expect(results.data[0].datapoints[0][0]).to.be('43.1');
            expect(results.data[0].datapoints[0][1]).to.be(1412606037000);
            expect(results.data[0].datapoints[1][0]).to.be('12');
            expect(results.data[0].datapoints[1][1]).to.be(1412606052000);
            expect(results.data[0].datapoints[2][0]).to.be('2');
            expect(results.data[0].datapoints[2][1]).to.be(1412606060000);
        });
    });
    describe('Resource search JSON', function () {
        var query = {
            range: { from: moment.utc([2014, 3, 10, 3, 20, 10]), to: moment.utc([2014, 3, 20, 3, 20, 10]) },
            targets: [{ hide: false, queryMode: 'resource_search', resource_search: '{"=": {"server_group": "autoscalig_group"}}',
                    resource_type: 'instance', label: '$display_name-${host}.foo-$type $metric', metric_name: 'cpu_.*', aggregator: 'max' }],
            interval: '1s'
        };
        var url_expected_search_resources = "/v1/search/resource/instance";
        var response_search_resources = [
            {
                "display_name": "myfirstvm",
                "host": "compute1",
                "id": "6868da77-fa82-4e67-aba9-270c5ae8cbca",
                "image_ref": "http://image",
                "type": "instance",
                "server_group": "autoscalig_group",
                "metrics": { "cpu_util": "1634173a-e3b8-4119-9eba-fa9a4d971c3b" }
            },
            {
                "display_name": "mysecondvm",
                "host": "compute3",
                "id": "f898ba55-bbea-460f-985c-3d1243348304",
                "image_ref": "http://image",
                "type": "instance",
                "server_group": "autoscalig_group",
                "metrics": { "cpu_util": "58b233f4-65ba-4aeb-97ba-b8bc0feec97e",
                    "cpu_time": "6ff95458-97b4-4b08-af03-7d18b05d277e" }
            }
        ];
        var url_expected_get_measures1 = "/v1/metric/1634173a-e3b8-4119-9eba-fa9a4d971c3b/measures?" +
            "aggregation=max&end=2014-04-20T03:20:10.000Z&start=2014-04-10T03:20:10.000Z&stop=2014-04-20T03:20:10.000Z";
        var response_get_measures1 = [
            ["2014-10-06T14:33:57+00:00", "60.0", "43.1"],
            ["2014-10-06T14:34:12+00:00", "60.0", "12"],
            ["2014-10-06T14:34:20+00:00", "60.0", "2"],
        ];
        var url_expected_get_measures2 = "/v1/metric/58b233f4-65ba-4aeb-97ba-b8bc0feec97e/measures?" +
            "aggregation=max&end=2014-04-20T03:20:10.000Z&start=2014-04-10T03:20:10.000Z&stop=2014-04-20T03:20:10.000Z";
        var response_get_measures2 = [
            ["2014-10-06T14:33:57+00:00", "60.0", "22.1"],
            ["2014-10-06T14:34:12+00:00", "60.0", "3"],
            ["2014-10-06T14:34:20+00:00", "60.0", "30"],
        ];
        var url_expected_get_measures3 = "/v1/metric/6ff95458-97b4-4b08-af03-7d18b05d277e/measures?" +
            "aggregation=max&end=2014-04-20T03:20:10.000Z&start=2014-04-10T03:20:10.000Z&stop=2014-04-20T03:20:10.000Z";
        var response_get_measures3 = [
            ["2014-10-06T14:33:57+00:00", "60.0", "2"],
            ["2014-10-06T14:34:12+00:00", "60.0", "1"],
            ["2014-10-06T14:34:20+00:00", "60.0", "1"],
        ];
        var results;
        beforeEach(function () {
            $httpBackend.expect('POST', url_expected_search_resources).respond(response_search_resources);
            $httpBackend.expect('GET', url_expected_get_measures1).respond(response_get_measures1);
            $httpBackend.expect('GET', url_expected_get_measures2).respond(response_get_measures2);
            $httpBackend.expect('GET', url_expected_get_measures3).respond(response_get_measures3);
            ds.query(query).then(function (data) { results = data; });
            $httpBackend.flush();
        });
        it("nothing more", function () {
            $httpBackend.verifyNoOutstandingExpectation();
            $httpBackend.verifyNoOutstandingRequest();
        });
        it('should return series list', function () {
            expect(results.data.length).to.be(3);
            expect(results.data[0].target).to.be('myfirstvm-compute1.foo-instance cpu_util');
            expect(results.data[1].target).to.be('mysecondvm-compute3.foo-instance cpu_util');
            expect(results.data[2].target).to.be('mysecondvm-compute3.foo-instance cpu_time');
            expect(results.data[0].datapoints[0][0]).to.be('43.1');
            expect(results.data[0].datapoints[0][1]).to.be(1412606037000);
            expect(results.data[0].datapoints[1][0]).to.be('12');
            expect(results.data[0].datapoints[1][1]).to.be(1412606052000);
            expect(results.data[0].datapoints[2][0]).to.be('2');
            expect(results.data[0].datapoints[2][1]).to.be(1412606060000);
        });
    });
    describe('Resource search filter expression', function () {
        var query = {
            range: { from: moment.utc([2014, 3, 10, 3, 20, 10]), to: moment.utc([2014, 3, 20, 3, 20, 10]) },
            targets: [{ hide: false, queryMode: 'resource_search', resource_search: 'server_group="autoscaling_group"',
                    resource_type: 'instance', label: '$display_name', metric_name: 'cpu_util', aggregator: 'max' }],
            interval: '1s'
        };
        var url_expected_search_resources = "/v1/search/resource/instance?filter=server_group%3D%22autoscaling_group%22";
        var response_search_resources = [
            {
                "display_name": "myfirstvm",
                "host": "compute1",
                "id": "6868da77-fa82-4e67-aba9-270c5ae8cbca",
                "image_ref": "http://image",
                "type": "instance",
                "server_group": "autoscalig_group",
                "metrics": { "cpu_util": "1634173a-e3b8-4119-9eba-fa9a4d971c3b" }
            },
            {
                "display_name": "mysecondvm",
                "host": "compute1",
                "id": "f898ba55-bbea-460f-985c-3d1243348304",
                "image_ref": "http://image",
                "type": "instance",
                "server_group": "autoscalig_group",
                "metrics": { "cpu_util": "d93563ef-2e19-4a02-a27b-7fc7bfb52d5e" }
            }
        ];
        var url_expected_get_measures1 = "/v1/metric/1634173a-e3b8-4119-9eba-fa9a4d971c3b/measures?" +
            "aggregation=max&end=2014-04-20T03:20:10.000Z&start=2014-04-10T03:20:10.000Z&stop=2014-04-20T03:20:10.000Z";
        var response_get_measures1 = [
            ["2014-10-06T14:33:57+00:00", "60.0", "43.1"],
            ["2014-10-06T14:34:12+00:00", "60.0", "12"],
            ["2014-10-06T14:34:20+00:00", "60.0", "2"],
        ];
        var url_expected_get_measures2 = "/v1/metric/d93563ef-2e19-4a02-a27b-7fc7bfb52d5e/measures?" +
            "aggregation=max&end=2014-04-20T03:20:10.000Z&start=2014-04-10T03:20:10.000Z&stop=2014-04-20T03:20:10.000Z";
        var response_get_measures2 = [
            ["2014-10-06T14:33:57+00:00", "60.0", "22.1"],
            ["2014-10-06T14:34:12+00:00", "60.0", "3"],
            ["2014-10-06T14:34:20+00:00", "60.0", "30"],
        ];
        var results;
        beforeEach(function () {
            $httpBackend.expect('POST', url_expected_search_resources).respond(response_search_resources);
            $httpBackend.expect('GET', url_expected_get_measures1).respond(response_get_measures1);
            $httpBackend.expect('GET', url_expected_get_measures2).respond(response_get_measures2);
            ds.query(query).then(function (data) { results = data; });
            $httpBackend.flush();
        });
        it("nothing more", function () {
            $httpBackend.verifyNoOutstandingExpectation();
            $httpBackend.verifyNoOutstandingRequest();
        });
        it('should return series list', function () {
            expect(results.data.length).to.be(2);
            expect(results.data[0].target).to.be('myfirstvm');
            expect(results.data[1].target).to.be('mysecondvm');
            expect(results.data[0].datapoints[0][0]).to.be('43.1');
            expect(results.data[0].datapoints[0][1]).to.be(1412606037000);
            expect(results.data[0].datapoints[1][0]).to.be('12');
            expect(results.data[0].datapoints[1][1]).to.be(1412606052000);
            expect(results.data[0].datapoints[2][0]).to.be('2');
            expect(results.data[0].datapoints[2][1]).to.be(1412606060000);
        });
    });
    describe('Resource search GroupBy', function () {
        var query = {
            range: { from: moment.utc([2014, 3, 10, 3, 20, 10]), to: moment.utc([2014, 3, 20, 3, 20, 10]) },
            targets: [{ hide: false, queryMode: 'resource_aggregation', resource_search: 'server_group="autoscaling_group"',
                    resource_type: 'instance', label: '$host - $project_id', metric_name: 'cpu_util', aggregator: 'max',
                    groupby: 'host,project_id', reaggregator: 'mean'
                }],
            interval: '1s'
        };
        var url_expected = "/v1/aggregation/resource/instance/metric/cpu_util?aggregation=max&end=2014-04-20T03:20:10.000Z" +
            "&filter=server_group%3D%22autoscaling_group%22&groupby=host&groupby=project_id&needed_overlap=0" +
            "&reaggregation=mean&start=2014-04-10T03:20:10.000Z&stop=2014-04-20T03:20:10.000Z";
        var response = [{
                "group": {
                    "host": "compute1",
                    "project_id": "project1"
                },
                "measures": [
                    ["2014-10-06T14:33:57+00:00", "60.0", "43.1"],
                    ["2014-10-06T14:34:12+00:00", "60.0", "12"],
                    ["2014-10-06T14:34:20+00:00", "60.0", "2"],
                ]
            }, {
                "group": {
                    "host": "compute2",
                    "project_id": "project2"
                },
                "measures": [
                    ["2014-10-06T14:33:57+00:00", "60.0", "43.1"],
                    ["2014-10-06T14:34:12+00:00", "60.0", "12"],
                    ["2014-10-06T14:34:20+00:00", "60.0", "2"],
                ]
            }];
        var results;
        beforeEach(function () {
            $httpBackend.expect('POST', url_expected).respond(response);
            ds.query(query).then(function (data) { results = data; });
            $httpBackend.flush();
        });
        it("nothing more", function () {
            $httpBackend.verifyNoOutstandingExpectation();
            $httpBackend.verifyNoOutstandingRequest();
        });
        it('should return series list', function () {
            expect(results.data.length).to.be(2);
            expect(results.data[0].target).to.be('compute1 - project1');
            expect(results.data[1].target).to.be('compute2 - project2');
            expect(results.data[0].datapoints[0][0]).to.be('43.1');
            expect(results.data[0].datapoints[0][1]).to.be(1412606037000);
            expect(results.data[0].datapoints[1][0]).to.be('12');
            expect(results.data[0].datapoints[1][1]).to.be(1412606052000);
            expect(results.data[0].datapoints[2][0]).to.be('2');
            expect(results.data[0].datapoints[2][1]).to.be(1412606060000);
        });
    });
    describe('Dynamic aggregations resource search groupby aggregated', function () {
        var query = {
            range: { from: moment.utc([2014, 3, 10, 3, 20, 10]), to: moment.utc([2014, 3, 20, 3, 20, 10]) },
            targets: [{ queryMode: 'dynamic_aggregates', operations: '(* 2 (metric cpu_util mean))',
                    resource_type: 'generic',
                    resource_search: 'server_group="autoscalig_group"',
                    groupby: 'host,project_id',
                    label: '${host} - ${project_id}', fill: 102 }],
            interval: '1s'
        };
        var url_expected_measure = '/v1/aggregates?details=true&end=2014-04-20T03:20:10.000Z&fill=102&start=2014-04-10T03:20:10.000Z' +
            '&stop=2014-04-20T03:20:10.000Z&groupby=host&groupby=project_id';
        // NOTE(sileht): CONTINUE HERE
        var response_measure = [{
                "group": {
                    "host": "compute1",
                    "project_id": "project1",
                },
                "measures": {
                    "measures": {
                        "aggregated": [
                            ["2014-10-06T14:33:57+00:00", "60.0", "43.1"],
                            ["2014-10-06T14:34:12+00:00", "60.0", "12"],
                            ["2014-10-06T14:34:20+00:00", "60.0", "2"],
                        ]
                    }
                }
            }, {
                "group": {
                    "host": "compute2",
                    "project_id": "project2"
                },
                "measures": {
                    "measures": {
                        "aggregated": [
                            ["2014-10-06T14:33:57+00:00", "60.0", "43.1"],
                            ["2014-10-06T14:34:12+00:00", "60.0", "12"],
                            ["2014-10-06T14:34:20+00:00", "60.0", "2"],
                        ]
                    }
                }
            }];
        var results;
        beforeEach(function () {
            $httpBackend.expect('POST', url_expected_measure).respond(response_measure);
            ds.query(query).then(function (data) { results = data; });
            $httpBackend.flush();
        });
        it("nothing more", function () {
            $httpBackend.verifyNoOutstandingExpectation();
            $httpBackend.verifyNoOutstandingRequest();
        });
        it('should return series list', function () {
            expect(results.data.length).to.be(2);
            expect(results.data[0].target).to.be('compute1 - project1');
            expect(results.data[1].target).to.be('compute2 - project2');
            expect(results.data[0].datapoints[0][0]).to.be('43.1');
            expect(results.data[0].datapoints[0][1]).to.be(1412606037000);
            expect(results.data[0].datapoints[1][0]).to.be('12');
            expect(results.data[0].datapoints[1][1]).to.be(1412606052000);
            expect(results.data[0].datapoints[2][0]).to.be('2');
            expect(results.data[0].datapoints[2][1]).to.be(1412606060000);
        });
    });
    describe('Dynamic aggregations resource search groupby', function () {
        var query = {
            range: { from: moment.utc([2014, 3, 10, 3, 20, 10]), to: moment.utc([2014, 3, 20, 3, 20, 10]) },
            targets: [{ queryMode: 'dynamic_aggregates', operations: '(* 2 (metric cpu_util mean))',
                    resource_type: 'generic',
                    resource_search: 'server_group="autoscalig_group"',
                    groupby: 'host,project_id',
                    label: '${host} - ${project_id} - ${id} - ${metric} - ${aggregation}', fill: 102 }],
            interval: '1s'
        };
        var url_expected_measure = '/v1/aggregates?details=true&end=2014-04-20T03:20:10.000Z&fill=102&start=2014-04-10T03:20:10.000Z' +
            '&stop=2014-04-20T03:20:10.000Z&groupby=host&groupby=project_id';
        // NOTE(sileht): CONTINUE HERE
        var response_measure = [{
                "group": {
                    "host": "compute1",
                    "project_id": "project1",
                },
                "measures": {
                    "references": [
                        {
                            "host": "compute1",
                            "id": "6868da77-fa82-4e67-aba9-270c5ae8cbca",
                            "project_id": "project1",
                        },
                        {
                            "host": "compute1",
                            "id": "f898ba55-bbea-460f-985c-3d1243348304",
                            "project_id": "project1",
                        }
                    ],
                    "measures": {
                        "6868da77-fa82-4e67-aba9-270c5ae8cbca": {
                            "cpu_util": {
                                "mean": [
                                    ["2014-10-06T14:33:57+00:00", "60.0", "43.1"],
                                    ["2014-10-06T14:34:12+00:00", "60.0", "12"],
                                    ["2014-10-06T14:34:20+00:00", "60.0", "2"],
                                ]
                            }
                        },
                        "f898ba55-bbea-460f-985c-3d1243348304": {
                            "cpu_util": {
                                "mean": [
                                    ["2014-10-06T14:33:57+00:00", "60.0", "22.1"],
                                    ["2014-10-06T14:34:12+00:00", "60.0", "3"],
                                    ["2014-10-06T14:34:20+00:00", "60.0", "30"],
                                ]
                            }
                        }
                    }
                }
            }, {
                "group": {
                    "host": "compute2",
                    "project_id": "project2"
                },
                "measures": {
                    "references": [
                        {
                            "host": "compute2",
                            "id": "ea95c765-8430-4185-9c5b-1b382e510554",
                            "project_id": "project2",
                        }
                    ],
                    "measures": {
                        "ea95c765-8430-4185-9c5b-1b382e510554": {
                            "cpu_util": {
                                "mean": [
                                    ["2014-10-06T14:33:57+00:00", "60.0", "43.1"],
                                    ["2014-10-06T14:34:12+00:00", "60.0", "12"],
                                    ["2014-10-06T14:34:20+00:00", "60.0", "2"],
                                ]
                            }
                        },
                    }
                }
            }];
        var results;
        beforeEach(function () {
            $httpBackend.expect('POST', url_expected_measure).respond(response_measure);
            ds.query(query).then(function (data) { results = data; });
            $httpBackend.flush();
        });
        it("nothing more", function () {
            $httpBackend.verifyNoOutstandingExpectation();
            $httpBackend.verifyNoOutstandingRequest();
        });
        it('should return series list', function () {
            expect(results.data.length).to.be(3);
            expect(results.data[0].target).to.be('compute1 - project1 - 6868da77-fa82-4e67-aba9-270c5ae8cbca - cpu_util - mean');
            expect(results.data[1].target).to.be('compute1 - project1 - f898ba55-bbea-460f-985c-3d1243348304 - cpu_util - mean');
            expect(results.data[2].target).to.be('compute2 - project2 - ea95c765-8430-4185-9c5b-1b382e510554 - cpu_util - mean');
            expect(results.data[0].datapoints[0][0]).to.be('43.1');
            expect(results.data[0].datapoints[0][1]).to.be(1412606037000);
            expect(results.data[0].datapoints[1][0]).to.be('12');
            expect(results.data[0].datapoints[1][1]).to.be(1412606052000);
            expect(results.data[0].datapoints[2][0]).to.be('2');
            expect(results.data[0].datapoints[2][1]).to.be(1412606060000);
        });
    });
    describe('Dynamic aggregations resource search aggregated', function () {
        var query = {
            range: { from: moment.utc([2014, 3, 10, 3, 20, 10]), to: moment.utc([2014, 3, 20, 3, 20, 10]) },
            targets: [{ queryMode: 'dynamic_aggregates', operations: '(* 2 (metric cpu_util mean))',
                    resource_type: 'generic',
                    resource_search: 'server_group="autoscalig_group"',
                    label: '${host} - ${display_name} - ${metric} - ${aggregation}', fill: 102 }],
            interval: '1s'
        };
        var url_expected_measure = '/v1/aggregates?details=true&end=2014-04-20T03:20:10.000Z&fill=102&start=2014-04-10T03:20:10.000Z' +
            '&stop=2014-04-20T03:20:10.000Z';
        // NOTE(sileht): CONTINUE HERE
        var response_measure = {
            "references": [
                {
                    "display_name": "myfirstvm",
                    "host": "compute1",
                    "id": "6868da77-fa82-4e67-aba9-270c5ae8cbca",
                    "image_ref": "http://image",
                    "type": "instance",
                    "server_group": "autoscalig_group",
                    "metrics": { "cpu_util": "1634173a-e3b8-4119-9eba-fa9a4d971c3b" }
                },
                {
                    "display_name": "mysecondvm",
                    "host": "compute3",
                    "id": "f898ba55-bbea-460f-985c-3d1243348304",
                    "image_ref": "http://image",
                    "type": "instance",
                    "server_group": "autoscalig_group",
                    "metrics": { "cpu_util": "58b233f4-65ba-4aeb-97ba-b8bc0feec97e",
                        "cpu_time": "6ff95458-97b4-4b08-af03-7d18b05d277e" }
                }
            ],
            "measures": {
                "aggregated": [
                    ["2014-10-06T14:33:57+00:00", "60.0", "43.1"],
                    ["2014-10-06T14:34:12+00:00", "60.0", "12"],
                    ["2014-10-06T14:34:20+00:00", "60.0", "2"],
                ]
            }
        };
        var results;
        beforeEach(function () {
            $httpBackend.expect('POST', url_expected_measure).respond(response_measure);
            ds.query(query).then(function (data) { results = data; });
            $httpBackend.flush();
        });
        it("nothing more", function () {
            $httpBackend.verifyNoOutstandingExpectation();
            $httpBackend.verifyNoOutstandingRequest();
        });
        it('should return series list', function () {
            expect(results.data.length).to.be(1);
            expect(results.data[0].target).to.be('${host} - ${display_name} - aggregated - ');
            expect(results.data[0].datapoints[0][0]).to.be('43.1');
            expect(results.data[0].datapoints[0][1]).to.be(1412606037000);
            expect(results.data[0].datapoints[1][0]).to.be('12');
            expect(results.data[0].datapoints[1][1]).to.be(1412606052000);
            expect(results.data[0].datapoints[2][0]).to.be('2');
            expect(results.data[0].datapoints[2][1]).to.be(1412606060000);
        });
    });
    describe('Dynamic aggregations resource search', function () {
        var query = {
            range: { from: moment.utc([2014, 3, 10, 3, 20, 10]), to: moment.utc([2014, 3, 20, 3, 20, 10]) },
            targets: [{ queryMode: 'dynamic_aggregates', operations: '(* 2 (metric cpu_util mean))',
                    resource_type: 'generic',
                    resource_search: 'server_group="autoscalig_group"',
                    label: '${host} - ${display_name} - ${metric} - ${aggregation}', fill: 102 }],
            interval: '1s'
        };
        var url_expected_measure = '/v1/aggregates?details=true&end=2014-04-20T03:20:10.000Z&fill=102&start=2014-04-10T03:20:10.000Z' +
            '&stop=2014-04-20T03:20:10.000Z';
        // NOTE(sileht): CONTINUE HERE
        var response_measure = {
            "references": [
                {
                    "display_name": "myfirstvm",
                    "host": "compute1",
                    "id": "6868da77-fa82-4e67-aba9-270c5ae8cbca",
                    "image_ref": "http://image",
                    "type": "instance",
                    "server_group": "autoscalig_group",
                    "metrics": { "cpu_util": "1634173a-e3b8-4119-9eba-fa9a4d971c3b" }
                },
                {
                    "display_name": "mysecondvm",
                    "host": "compute3",
                    "id": "f898ba55-bbea-460f-985c-3d1243348304",
                    "image_ref": "http://image",
                    "type": "instance",
                    "server_group": "autoscalig_group",
                    "metrics": { "cpu_util": "58b233f4-65ba-4aeb-97ba-b8bc0feec97e",
                        "cpu_time": "6ff95458-97b4-4b08-af03-7d18b05d277e" }
                }
            ],
            "measures": {
                "6868da77-fa82-4e67-aba9-270c5ae8cbca": {
                    "cpu_util": {
                        "mean": [
                            ["2014-10-06T14:33:57+00:00", "60.0", "43.1"],
                            ["2014-10-06T14:34:12+00:00", "60.0", "12"],
                            ["2014-10-06T14:34:20+00:00", "60.0", "2"],
                        ]
                    }
                },
                "f898ba55-bbea-460f-985c-3d1243348304": {
                    "cpu_util": {
                        "mean": [
                            ["2014-10-06T14:33:57+00:00", "60.0", "22.1"],
                            ["2014-10-06T14:34:12+00:00", "60.0", "3"],
                            ["2014-10-06T14:34:20+00:00", "60.0", "30"],
                        ]
                    }
                }
            }
        };
        var results;
        beforeEach(function () {
            $httpBackend.expect('POST', url_expected_measure).respond(response_measure);
            ds.query(query).then(function (data) { results = data; });
            $httpBackend.flush();
        });
        it("nothing more", function () {
            $httpBackend.verifyNoOutstandingExpectation();
            $httpBackend.verifyNoOutstandingRequest();
        });
        it('should return series list', function () {
            expect(results.data.length).to.be(2);
            expect(results.data[0].target).to.be('compute1 - myfirstvm - cpu_util - mean');
            expect(results.data[1].target).to.be('compute3 - mysecondvm - cpu_util - mean');
            expect(results.data[0].datapoints[0][0]).to.be('43.1');
            expect(results.data[0].datapoints[0][1]).to.be(1412606037000);
            expect(results.data[0].datapoints[1][0]).to.be('12');
            expect(results.data[0].datapoints[1][1]).to.be(1412606052000);
            expect(results.data[0].datapoints[2][0]).to.be('2');
            expect(results.data[0].datapoints[2][1]).to.be(1412606060000);
        });
    });
    describe('Dynamic aggregations metric ids', function () {
        var query = {
            range: { from: moment.utc([2014, 3, 10, 3, 20, 10]), to: moment.utc([2014, 3, 20, 3, 20, 10]) },
            targets: [{ queryMode: 'dynamic_aggregates', operations: '(* 2 (metric 58b233f4-65ba-4aeb-97ba-b8bc0feec97e mean))',
                    label: '${metric} - ${aggregation}', fill: 102 }],
            interval: '1s'
        };
        var url_expected_measure = '/v1/aggregates?details=true&end=2014-04-20T03:20:10.000Z&fill=102&start=2014-04-10T03:20:10.000Z' +
            '&stop=2014-04-20T03:20:10.000Z';
        // NOTE(sileht): CONTINUE HERE
        var response_measure = {
            "references": [
                {
                    "id": "6868da77-fa82-4e67-aba9-270c5ae8cbca",
                },
                {
                    "id": "f898ba55-bbea-460f-985c-3d1243348304",
                }
            ],
            "measures": {
                "6868da77-fa82-4e67-aba9-270c5ae8cbca": {
                    "mean": [
                        ["2014-10-06T14:33:57+00:00", "60.0", "43.1"],
                        ["2014-10-06T14:34:12+00:00", "60.0", "12"],
                        ["2014-10-06T14:34:20+00:00", "60.0", "2"],
                    ]
                },
                "f898ba55-bbea-460f-985c-3d1243348304": {
                    "mean": [
                        ["2014-10-06T14:33:57+00:00", "60.0", "22.1"],
                        ["2014-10-06T14:34:12+00:00", "60.0", "3"],
                        ["2014-10-06T14:34:20+00:00", "60.0", "30"],
                    ]
                }
            }
        };
        var results;
        beforeEach(function () {
            $httpBackend.expect('POST', url_expected_measure).respond(response_measure);
            ds.query(query).then(function (data) { results = data; });
            $httpBackend.flush();
        });
        it("nothing more", function () {
            $httpBackend.verifyNoOutstandingExpectation();
            $httpBackend.verifyNoOutstandingRequest();
        });
        it('should return series list', function () {
            expect(results.data.length).to.be(2);
            expect(results.data[0].target).to.be('6868da77-fa82-4e67-aba9-270c5ae8cbca - mean');
            expect(results.data[1].target).to.be('f898ba55-bbea-460f-985c-3d1243348304 - mean');
            expect(results.data[0].datapoints[0][0]).to.be('43.1');
            expect(results.data[0].datapoints[0][1]).to.be(1412606037000);
            expect(results.data[0].datapoints[1][0]).to.be('12');
            expect(results.data[0].datapoints[1][1]).to.be(1412606052000);
            expect(results.data[0].datapoints[2][0]).to.be('2');
            expect(results.data[0].datapoints[2][1]).to.be(1412606060000);
        });
    });
    describe("TestDatasource success", function () {
        var results;
        beforeEach(function () {
            $httpBackend.expect('GET', "").respond(200);
            ds.testDatasource().then(function (data) { results = data; });
            $httpBackend.flush();
        });
        it("nothing more", function () {
            $httpBackend.verifyNoOutstandingExpectation();
            $httpBackend.verifyNoOutstandingRequest();
        });
        it('should success', function () {
            expect(results.status).to.be('success');
            expect(results.message).to.be('Data source is working');
        });
    });
    describe("TestDatasource keystone success", function () {
        var results;
        beforeEach(function () {
            ds = new module_1.Datasource({
                'url': 'http://localhost:5000',
                'jsonData': { 'mode': 'keystone', 'endpoint': 'http://localhost:5000', 'username': 'user',
                    'project': 'proj', 'password': 'pass', 'domain': 'foo' }
            }, $q, backendSrv, templateSrv);
            $httpBackend.expect('POST', "http://localhost:5000/v3/auth/tokens", { "auth": { "identity": { "methods": ["password"],
                        "password": { "user": { "name": "user", "password": "pass", "domain": { "id": "foo" } } } },
                    "scope": { "project": { "domain": { "id": "foo" }, "name": "proj" } } } }, { 'Content-Type': 'application/json', "Accept": "application/json, text/plain, */*" }).respond({ 'token': { 'catalog': [{ 'type': 'metric', 'endpoints': [{ 'url': 'http://localhost:8041/', 'interface': 'public' }] }] } }, { 'X-Subject-Token': 'foobar' });
            $httpBackend.expect('GET', "http://localhost:8041/v1/resource", null, { "Accept": "application/json, text/plain, */*",
                "X-Auth-Token": "foobar" }).respond(200);
            ds.testDatasource().then(function (data) { results = data; });
            $httpBackend.flush();
        });
        it("nothing more", function () {
            $httpBackend.verifyNoOutstandingExpectation();
            $httpBackend.verifyNoOutstandingRequest();
        });
        it('should success', function () {
            expect(results.status).to.be('success');
            expect(results.message).to.be('Data source is working');
        });
    });
    describe("metricFindQuery resource", function () {
        var url_expected_search_resources = "/v1/search/resource/instance?attrs=id";
        var response_search_resources = [
            {
                "id": "6868da77-fa82-4e67-aba9-270c5ae8cbca"
            },
            {
                "id": "f898ba55-bbea-460f-985c-3d1243348304"
            }
        ];
        var results;
        beforeEach(function () {
            $httpBackend.expect('GET', "/").respond({ "build": "4.2.0" });
            $httpBackend.expect('POST', url_expected_search_resources).respond(response_search_resources);
            ds.metricFindQuery('resources(instance, id, {"=": {"id": "foobar"}})').then(function (data) { results = data; });
            $httpBackend.flush();
        });
        it("nothing more", function () {
            $httpBackend.verifyNoOutstandingExpectation();
            $httpBackend.verifyNoOutstandingRequest();
        });
        it('should success', function () {
            expect(results.length).to.be(2);
            expect(results[0].text).to.be("6868da77-fa82-4e67-aba9-270c5ae8cbca");
            expect(results[1].text).to.be("f898ba55-bbea-460f-985c-3d1243348304");
        });
    });
    describe("metricFindQuery resource without attrs parameter", function () {
        var url_expected_search_resources = "/v1/search/resource/instance";
        var response_search_resources = [
            {
                "display_name": "myfirstvm",
                "host": "compute1",
                "id": "6868da77-fa82-4e67-aba9-270c5ae8cbca",
                "image_ref": "http://image",
                "type": "instance",
                "server_group": "autoscalig_group",
                "metrics": { "cpu_util": "1634173a-e3b8-4119-9eba-fa9a4d971c3b" }
            },
            {
                "display_name": "mysecondvm",
                "host": "compute1",
                "id": "f898ba55-bbea-460f-985c-3d1243348304",
                "image_ref": "http://image",
                "type": "instance",
                "server_group": "autoscalig_group",
                "metrics": { "cpu_util": "1634173a-e3b8-4119-9eba-fa9a4d971c3b" }
            }
        ];
        var results;
        beforeEach(function () {
            $httpBackend.expect('GET', "/").respond({ "build": "4.1.99" });
            $httpBackend.expect('POST', url_expected_search_resources).respond(response_search_resources);
            ds.metricFindQuery('resources(instance, id, {"=": {"id": "foobar"}})').then(function (data) { results = data; });
            $httpBackend.flush();
        });
        it("nothing more", function () {
            $httpBackend.verifyNoOutstandingExpectation();
            $httpBackend.verifyNoOutstandingRequest();
        });
        it('should success', function () {
            expect(results.length).to.be(2);
            expect(results[0].text).to.be("6868da77-fa82-4e67-aba9-270c5ae8cbca");
            expect(results[1].text).to.be("f898ba55-bbea-460f-985c-3d1243348304");
        });
    });
    describe("metricFindQuery metric", function () {
        var url_expected = "/v1/resource/generic/6868da77-fa82-4e67-aba9-270c5ae8cbca";
        var response_resource = {
            "created_by_project_id": "8a722a26-e0a0-4993-b283-76925b7b02de",
            "created_by_user_id": "5587ebf3-58a5-42eb-8024-ef756e09a552",
            "ended_at": null,
            "id": "cba8d3d5-d5e1-4692-bcfe-d77feaf01d7e",
            "metrics": {
                "temperature": "86adbe6c-22d7-4a86-9ab7-e8d112f6cb79",
                "cpu_util": "ccdd3d2c-7f83-42a0-9280-49e0791349dd"
            },
            "project_id": "bd3a1e52-1c62-44cb-bf04-660bd88cd74d",
            "revision_end": null,
            "revision_start": "2015-09-10T08:00:25.690667+00:00",
            "started_at": "2015-09-10T08:00:25.690654+00:00",
            "type": "generic",
            "user_id": "bd3a1e52-1c62-44cb-bf04-660bd88cd74d"
        };
        var results;
        beforeEach(function () {
            $httpBackend.expect('GET', url_expected).respond(response_resource);
            ds.metricFindQuery('metrics(6868da77-fa82-4e67-aba9-270c5ae8cbca)').then(function (data) { results = data; });
            $httpBackend.flush();
        });
        it("nothing more", function () {
            $httpBackend.verifyNoOutstandingExpectation();
            $httpBackend.verifyNoOutstandingRequest();
        });
        it('should success', function () {
            expect(results.length).to.be(2);
            expect(results[0].text).to.be("temperature");
            expect(results[1].text).to.be("cpu_util");
        });
    });
    describe("metricFindQuery unknown", function () {
        var results;
        beforeEach(function () {
            ds.metricFindQuery('not_existing(instance, id, {"=": {"id": "foobar"}})').then(function (data) { results = data; });
        });
        it("nothing more", function () {
            $httpBackend.verifyNoOutstandingExpectation();
            $httpBackend.verifyNoOutstandingRequest();
        });
        it('should success', function () {
            expect(results.length).to.be(0);
        });
    });
    // QueryCtrl tests
    var resources = [
        {
            "created_by_project_id": "8a722a26-e0a0-4993-b283-76925b7b02de",
            "created_by_user_id": "5587ebf3-58a5-42eb-8024-ef756e09a552",
            "ended_at": null,
            "id": "cba8d3d5-d5e1-4692-bcfe-d77feaf01d7e",
            "metrics": {
                "temperature": "86adbe6c-22d7-4a86-9ab7-e8d112f6cb79",
                "cpu_util": "ccdd3d2c-7f83-42a0-9280-49e0791349dd"
            },
            "project_id": "bd3a1e52-1c62-44cb-bf04-660bd88cd74d",
            "revision_end": null,
            "revision_start": "2015-09-10T08:00:25.690667+00:00",
            "started_at": "2015-09-10T08:00:25.690654+00:00",
            "type": "generic",
            "user_id": "bd3a1e52-1c62-44cb-bf04-660bd88cd74d"
        },
        {
            "created_by_project_id": "8a722a26-e0a0-4993-b283-76925b7b02de",
            "created_by_user_id": "5587ebf3-58a5-42eb-8024-ef756e09a552",
            "ended_at": null,
            "id": "9b4f6da9-4e67-4cfd-83bd-fb4b8bcc8dd8",
            "metrics": {},
            "project_id": "bd3a1e52-1c62-44cb-bf04-660bd88cd74d",
            "revision_end": null,
            "revision_start": "2015-09-10T08:00:25.690667+00:00",
            "started_at": "2015-09-10T08:00:25.690654+00:00",
            "type": "generic",
            "user_id": "bd3a1e52-1c62-44cb-bf04-660bd88cd74d"
        },
    ];
    var metrics = [
        {
            "id": "b8c73d22-d944-47d9-9d84-1e7f618c25e1",
            "archive_policy": {},
            "created_by_project_id": "8a722a26-e0a0-4993-b283-76925b7b02de",
            "created_by_user_id": "5587ebf3-58a5-42eb-8024-ef756e09a552",
            "name": "temperature",
            "resource_id": "cba8d3d5-d5e1-4692-bcfe-d77feaf01d7e"
        },
        {
            "id": "86adbe6c-22d7-4a86-9ab7-e8d112f6cb79",
            "archive_policy": {},
            "created_by_project_id": "8a722a26-e0a0-4993-b283-76925b7b02de",
            "created_by_user_id": "5587ebf3-58a5-42eb-8024-ef756e09a552",
            "name": "cpu_util",
            "resource_id": "cba8d3d5-d5e1-4692-bcfe-d77feaf01d7e"
        }
    ];
    var resource_types = [
        {
            "attributes": {},
            "name": "generic",
            "state": "active"
        },
        {
            "attributes": {
                "display_name": {
                    "max_length": 255,
                    "min_length": 0,
                    "required": true,
                    "type": "string"
                },
            },
            "name": "instance",
            "state": "active"
        },
    ];
    describe('getResourceTypes', function () {
        var results;
        it('should return resource type names', function () {
            $httpBackend.expect('GET', "/v1/resource_type").respond(resource_types);
            ds.getResourceTypes().then(function (data) { results = data; });
            $httpBackend.flush();
            expect(results.length).to.be(2);
            expect(results[0]['name']).to.be('generic');
            expect(results[1]['name']).to.be('instance');
        });
    });
    describe('build attribute parameter', function () {
        it('complex display attribute', function () {
            var value_attribute = 'id';
            var display_attribute = '$name $f$g$$ ${foo_bar-baz}${{} -${id}%';
            expect(ds.buildAttributeParam(value_attribute, display_attribute))
                .to.eql(['name', 'f', 'g', 'foo_bar-baz', 'id']);
        });
        it('empty display attribute', function () {
            var value_attribute = 'id';
            var display_attribute = '';
            expect(ds.buildAttributeParam(value_attribute, display_attribute))
                .to.eql(['id']);
        });
    });
});
//# sourceMappingURL=gnocchi-datasource-specs.js.map