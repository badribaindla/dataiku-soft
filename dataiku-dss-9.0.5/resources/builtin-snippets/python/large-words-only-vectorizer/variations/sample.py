from sklearn.feature_extraction.text import CountVectorizer

# A custom code vectorizer must define the 'transformer' variable
transformer = CountVectorizer(
             min_df = 3, # Tokens must appear at least in 3 documents
             max_df = 0.8, # Tokens that appear in more than 80% of documents are ignored
             ngram_range = (1,3),
             # Here we override the token selection regexp
             token_pattern = u'(?u)\\b\\w\\w\\w\\w\\w+\\b')