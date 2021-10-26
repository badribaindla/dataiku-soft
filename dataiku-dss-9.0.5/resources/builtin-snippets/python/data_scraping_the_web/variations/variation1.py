# -*- coding: utf-8 -*-
import json
import urllib
from bs4 import BeautifulSoup
from dataiku import Dataset

LISTING = 'http://www.site.com/en/data?page='
NPAGES = 100
RESULTS = []


# scraping
def scrape(page_num):
    url = LISTING + str(page_num).strip()
    # load page content
    page = urllib.urlopen(url)
    # find the interesting data with html
    soup = BeautifulSoup(page, 'html5lib')
    result = soup.find('div', {'id': 'places'}).find('form')['data-results']
    listing = json.loads(result)
    # keep the data in RESULTS
    data = listing.get('results', [])
    for e in data:
        RESULTS.append(e)

for p in xrange(1, NPAGES + 1):
    print "Crawling page", p
    scrape(p)

print "Crawled %i places" % len(RESULTS)

# Write in a dataset
site_data = Dataset("__FIRST_OUTPUT__")

schema = [
  {'name': 'key', 'type': 'int'},
  {'name': 'data', 'type': 'string'}
]

site_data.write_schema(schema)

writer = site_data.get_writer()
for i, e in enumerate(RESULTS):
    data = [i, json.dumps(e)]
    writer.write_tuple(data)