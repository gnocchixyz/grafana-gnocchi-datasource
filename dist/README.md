# Grafana Gnocchi datasource [![Travis CI](https://travis-ci.org/gnocchixyz/grafana-gnocchi-datasource.png?branch=master)](https://travis-ci.org/gnocchixyz/grafana-gnocchi-datasource)

Gnocchi datasource for Grafana >= 4

![](https://raw.githubusercontent.com/gnocchixyz/grafana-gnocchi-datasource/master/docs/collectd-dashboard.png)

## Installation via grafana.net

    $ sudo grafana-cli plugins install gnocchixyz-gnocchi-datasource


## Installation from sources

    $ npm install
    $ ./run-tests.sh  # This also build the plugin under dist/

    $ ln -s dist /var/lib/grafana/plugins/grafana-gnocchi-datasource
    $ # or
    $ cp -a dist /var/lib/grafana/plugins/grafana-gnocchi-datasource


## Configuration Panel

![](https://raw.githubusercontent.com/gnocchixyz/grafana-gnocchi-datasource/master/docs/add_datasource_gnocchi.png)

Name | Description
------------ | -------------
Name | The data source name.
Default | Default data source means that it will be pre-selected for new panels.
Url | The http protocol, ip and port of your Keystone or Gnocchi server (default port is usually 8080)
Access | Proxy = access via Grafana backend, Direct = access directory from browser.
Token | A valid Keystone token
Project | The keystone user
User | The Keystone user
Password | The Keystone password

Note: If the Keystone server is set as URL, the Gnocchi server will be autodiscovered.
This works only if Access = Direct, and CORS is properly configured on Keystone and Gnocchi side.

## Query editor

The editor leverage thes Dynamic Aggregate API of Gnocchi:

* Select first the *resource type* you are looking for.
* Create a *query* to select all resources you need.
* Create an *operation* that selects metric and does math on/between them.
* Set *label* to name each graph with text or with resource attributes.

The `Query` format is documented as STRING format in *Resource search* section of [Gnocchi documentations](http://gnocchi.xyz/rest.html#search).
The `Operation` format is documented in *Dynamic Aggregates* section of [Gnocchi documentations](https://gnocchi.xyz/rest.html#list-of-supported-operations).

  ![](https://raw.githubusercontent.com/gnocchixyz/grafana-gnocchi-datasource/master/docs/grafana-dynamic.png)

Other *Query type* exists for special use case and for old Gnocchi version that doesn't support *Dynamic aggregates*

## Labels

Labels can be expressed with resources attributes and metric name. To do so attribute must be surrounded by ${} or prefixed by $.

For example, takes the metric regex "cpu_*", the label
"$display_name-${host}.foo-$type $metric" and a query that returns these
resources::

    [
      {
        "display_name": "myfirstvm",
        "host": "compute1",
        "id": "6868da77-fa82-4e67-aba9-270c5ae8cbca",
        "image_ref": "http://image",
        "type": "instance",
        "server_group": "autoscalig_group",
        "metrics": {"cpu_util": "1634173a-e3b8-4119-9eba-fa9a4d971c3b"}
      },
      {
        "display_name": "mysecondvm",
        "host": "compute3",
        "id": "f898ba55-bbea-460f-985c-3d1243348304",
        "image_ref": "http://image",
        "type": "instance",
        "server_group": "autoscalig_group",
        "metrics": {"cpu_util": "58b233f4-65ba-4aeb-97ba-b8bc0feec97e",
                    "cpu_time": "6ff95458-97b4-4b08-af03-7d18b05d277e"}
      }
    ]

The resulting labels are::

  myfirstvm-compute1.foo-instance cpu_util
  mysecondvm-compute3.foo-instance cpu_util
  mysecondvm-compute3.foo-instance cpu_time

## Templated queries

Gnocchi Datasource Plugin provides following functions in `Variables values query` field in Templating Editor.

Name | Description
| ------- | --------|
`metrics(resource_id)`  | Returns a list of metrics available for the resource identified by ‘resource_id’
`resources(resource_type, `attribute`, query)` | Returns a list of resource `attribute` matching `query`.
`resources(resource_type, `attribute1`, `attribute2`, query)` | Returns a list of resource `attribute` matching `query`, `attribute1` is diplayed in selector, `attribute1` used for templating.

  ![](https://raw.githubusercontent.com/gnocchixyz/grafana-gnocchi-datasource/master/docs/gnocchi_templating.png)

For details of `Query` format, please refer to the Gnocchi and Gnocchi client documentations.

- [Search for resource - Gnocchi client Documentation](http://gnocchi.xyz/gnocchiclient/shell.html#gnocchi-resource-search) for expression format
- [Search for resource - Gnocchi Documentation](http://gnocchi.xyz/rest.html#searching-for-resources) for the raw json format.

## Current Limitation

Using Keystone, CORS MUST be enabled on Keystone and Gnocchi servers.

## License

APACHE LICENSE Version 2.0, January 2004
