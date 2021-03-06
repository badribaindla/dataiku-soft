# -*- coding: utf-8 -*-
#-----------------------------------------------------------------------------
# Copyright (c) 2012 - 2017, Anaconda, Inc. All rights reserved.
#
# Powered by the Bokeh Development Team.
#
# The full license is in the file LICENSE.txt, distributed with this software.
#-----------------------------------------------------------------------------

#-----------------------------------------------------------------------------
# Boilerplate
#-----------------------------------------------------------------------------
from __future__ import absolute_import, division, print_function, unicode_literals

import pytest ; pytest

#-----------------------------------------------------------------------------
# Imports
#-----------------------------------------------------------------------------

# Standard library imports
from mock import patch
import re

# External imports
from PIL import Image

# Bokeh imports
from bokeh.models.plots import Plot
from bokeh.models.ranges import Range1d
from bokeh.models.widgets.markups import Div
from bokeh.io.export import create_webdriver, terminate_webdriver
from bokeh.resources import Resources

# Module under test
import bokeh.io.export as bie

#-----------------------------------------------------------------------------
# Setup
#-----------------------------------------------------------------------------

#-----------------------------------------------------------------------------
# General API
#-----------------------------------------------------------------------------

#-----------------------------------------------------------------------------
# Dev API
#-----------------------------------------------------------------------------

@pytest.mark.unit
@pytest.mark.selenium
def test_get_screenshot_as_png():
    layout = Plot(x_range=Range1d(), y_range=Range1d(),
                  plot_height=20, plot_width=20, toolbar_location=None,
                  outline_line_color=None, background_fill_color=None,
                  border_fill_color=None)

    png = bie.get_screenshot_as_png(layout)
    assert png.size == (20, 20)
    # a 20x20px image of transparent pixels
    assert png.tobytes() == ("\x00"*1600).encode()

@pytest.mark.unit
@pytest.mark.selenium
def test_get_screenshot_as_png_with_driver():
    layout = Plot(x_range=Range1d(), y_range=Range1d(),
                  plot_height=20, plot_width=20, toolbar_location=None,
                  outline_line_color=None, background_fill_color=None,
                  border_fill_color=None)

    driver = create_webdriver()
    try:
        png = bie.get_screenshot_as_png(layout, driver=driver)
    finally:
        terminate_webdriver(driver)

    assert png.size == (20, 20)
    # a 20x20px image of transparent pixels
    assert png.tobytes() == ("\x00"*1600).encode()

@pytest.mark.unit
@pytest.mark.selenium
def test_get_screenshot_as_png_large_plot():
    layout = Plot(x_range=Range1d(), y_range=Range1d(),
                  plot_height=800, plot_width=800, toolbar_location=None,
                  outline_line_color=None, background_fill_color=None,
                  border_fill_color=None)

    driver = create_webdriver()
    try:
        assert driver.get_window_size() == {'width': 400, 'height': 300}

        bie.get_screenshot_as_png(layout, driver=driver)

        # LC: Although the window size doesn't match the plot dimensions (unclear
        # why), the window resize allows for the whole plot to be captured
        assert driver.get_window_size() == {'width': 1366, 'height': 768}
    finally:
        # Have to manually clean up the driver session
        terminate_webdriver(driver)

@pytest.mark.unit
@pytest.mark.selenium
def test_get_screenshot_as_png_with_unicode_minified():
    layout = Div(text="?????? ?????? ??????????????? ?????? ?????????")

    driver = create_webdriver()
    try:
        png = bie.get_screenshot_as_png(layout, driver=driver, resources=Resources(mode="inline", minified=True))
    finally:
        # Have to manually clean up the driver session
        terminate_webdriver(driver)
    assert len(png.tobytes()) > 0

@pytest.mark.unit
@pytest.mark.selenium
def test_get_screenshot_as_png_with_unicode_unminified():
    layout = Div(text="?????? ?????? ??????????????? ?????? ?????????")

    driver = create_webdriver()
    try:
        png = bie.get_screenshot_as_png(layout, driver=driver, resources=Resources(mode="inline", minified=False))
    finally:
        # Have to manually clean up the driver session
        terminate_webdriver(driver)
    assert len(png.tobytes()) > 0

@pytest.mark.unit
@pytest.mark.selenium
def test_get_svgs_no_svg_present():
    layout = Plot(x_range=Range1d(), y_range=Range1d(),
              plot_height=20, plot_width=20, toolbar_location=None)

    svgs = bie.get_svgs(layout)
    assert svgs == []

@pytest.mark.unit
@pytest.mark.selenium
def test_get_svgs_with_svg_present():

    def fix_ids(svg):
        svg = re.sub(r'id="\w{12}"', 'id="X"', svg)
        svg = re.sub(r'url\(#\w{12}\)', 'url(#X)', svg)
        return svg

    layout = Plot(x_range=Range1d(), y_range=Range1d(),
                  plot_height=20, plot_width=20, toolbar_location=None,
                  outline_line_color=None, border_fill_color=None,
                  background_fill_color="red", output_backend="svg")

    svg0 = fix_ids(bie.get_svgs(layout)[0])

    driver = create_webdriver()
    try:
        svg1 = fix_ids(bie.get_svgs(layout)[0])
    finally:
        terminate_webdriver(driver) # Have to manually clean up the driver session

    svg2 = (
        '<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
        'width="20" height="20" style="width: 20px; height: 20px;">'
        '<defs>'
            '<clipPath id="X"><path fill="none" stroke="none" d=" M 5 5 L 15 5 L 15 15 L 5 15 L 5 5 Z"/></clipPath>'
            '<clipPath id="X"><path fill="none" stroke="none" d=" M 5 5 L 15 5 L 15 15 L 5 15 L 5 5 Z"/></clipPath>'
        '</defs>'
        '<g>'
            '<g transform="scale(1,1) translate(0.5,0.5)">'
                '<rect fill="#FFFFFF" stroke="none" x="0" y="0" width="20" height="20"/>'
                '<rect fill="red" stroke="none" x="5" y="5" width="10" height="10"/>'
                '<g/>'
                '<g clip-path="url(#X)"><g/></g>'
                '<g clip-path="url(#X)"><g/></g>'
                '<g/>'
            '</g>'
        '</g>'
        '</svg>'
    )

    assert svg0 == svg2
    assert svg1 == svg2

def test_get_layout_html_resets_plot_dims():
    initial_height, initial_width = 200, 250

    layout = Plot(x_range=Range1d(), y_range=Range1d(),
                  plot_height=initial_height, plot_width=initial_width)

    bie.get_layout_html(layout, height=100, width=100)

    assert layout.plot_height == initial_height
    assert layout.plot_width == initial_width

#-----------------------------------------------------------------------------
# Private API
#-----------------------------------------------------------------------------

@patch('PIL.Image.Image')
def test__crop_image_args(mock_Image):
    image = mock_Image()
    bie._crop_image(image, left='left', right='right', top='top', bottom='bottom', extra=10)
    assert image.crop.call_count == 1
    assert image.crop.call_args[0] == (('left', 'top', 'right', 'bottom'), )
    assert image.crop.call_args[1] == {}

def test__crop_image():
    image = Image.new(mode="RGBA", size=(10,10))
    rect = dict(left=2, right=8, top=3, bottom=7)
    cropped = bie._crop_image(image, **rect)
    assert cropped.size == (6,4)
