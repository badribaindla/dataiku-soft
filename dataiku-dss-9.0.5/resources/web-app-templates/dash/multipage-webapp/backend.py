import dataiku
import dash
import dash_core_components as dcc
import dash_html_components as html
from dash.dependencies import Input, Output, State
from dash.exceptions import PreventUpdate

# use the style of examples on the Plotly documentation
app.config.external_stylesheets = ['https://codepen.io/chriddyp/pen/bWLwgP.css']

# url, root-url and first-loading are used for routing
url_bar_and_content_div = html.Div([
    dcc.Location(id='url', refresh=False),
    html.Div(id='root-url', style={'display': 'none'}),
    html.Div(id='first-loading', style={'display': 'none'}),
    html.Div(id='page-content')
])

layout_index = html.Div([
    dcc.Link('Navigate to "page-1"', href='page-1'),
    html.Br(),
    dcc.Link('Navigate to "page-2"', href='page-2'),
])

layout_page_1 = html.Div([
    html.H2('Page 1'),
    dcc.Input(id='input-1-state', type='text', value='Montreal'),
    dcc.Input(id='input-2-state', type='text', value='Canada'),
    html.Button(id='submit-button', n_clicks=0, children='Submit'),
    html.Div(id='output-state'),
    html.Br(),
    dcc.Link('Navigate to "/"', id='page-1-root-link', href=''),
    html.Br(),
    dcc.Link('Navigate to "/page-2"', href='page-2'),
])

layout_page_2 = html.Div([
    html.H2('Page 2'),
    dcc.Dropdown(
        id='page-2-dropdown',
        options=[{'label': i, 'value': i} for i in ['LA', 'NYC', 'MTL']],
        value='LA'
    ),
    html.Div(id='page-2-display-value'),
    html.Br(),
    dcc.Link('Navigate to "/"', id='page-2-root-link', href=''),
    html.Br(),
    dcc.Link('Navigate to "/page-1"', href='page-1'),
])

# index layout
app.layout = url_bar_and_content_div

# "complete" layout, need at least Dash 1.12
app.validation_layout = html.Div([
    url_bar_and_content_div,
    layout_index,
    layout_page_1,
    layout_page_2,
])

# The following callback is used to dynamically instantiate the root-url
@app.callback([dash.dependencies.Output('root-url', 'children'), dash.dependencies.Output('first-loading', 'children')],
              dash.dependencies.Input('url', 'pathname'),
              dash.dependencies.State('first-loading', 'children')
              )
def update_root_url(pathname, first_loading):
    if first_loading is None:
        return pathname, True
    else:
        raise PreventUpdate

# We can now use the hidden root-url div to update the link in page-1 and page-2
@app.callback(dash.dependencies.Output('page-1-root-link', 'href'),
              [dash.dependencies.Input('root-url', 'children')])
def update_root_link(root_url):
    return root_url

@app.callback(dash.dependencies.Output('page-2-root-link', 'href'),
              [dash.dependencies.Input('root-url', 'children')])
def update_root_link(root_url):
    return root_url

# This is the callback doing the routing
@app.callback(dash.dependencies.Output('page-content', 'children'),
              [
                  dash.dependencies.Input('root-url', 'children'),
                  dash.dependencies.Input('url', 'pathname')
              ])
def display_page(root_url, pathname):
    if root_url + "page-1" == pathname :
        return layout_page_1
    elif root_url + "page-2" == pathname :
        return layout_page_2
    else:
        return layout_index

# Page 1 callbacks
@app.callback(Output('output-state', 'children'),
              [Input('submit-button', 'n_clicks')],
              [State('input-1-state', 'value'),
               State('input-2-state', 'value')])
def update_output(n_clicks, input1, input2):
    return ('The Button has been pressed {} times,'
            'Input 1 is "{}",'
            'and Input 2 is "{}"').format(n_clicks, input1, input2)


# Page 2 callbacks
@app.callback(Output('page-2-display-value', 'children'),
              [Input('page-2-dropdown', 'value')])
def display_value(value):
    print('display_value')
    return 'You have selected "{}"'.format(value)
