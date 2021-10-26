X = my_df.values

# Rescale data
from sklearn.preprocessing import StandardScaler
ss = StandardScaler().fit(X)
X_std = ss.transform(X)

# Apply the t-SNE algorithm
from sklearn.manifold import TSNE
tsne = TSNE(n_components=2, random_state=0)
tsne_data = tsne.fit_transform(X_std[:1000]) # We will display the first 1000 rows only

# Plot the 2D representation
plt.scatter(tsne_data[:,0],tsne_data[:,1])
