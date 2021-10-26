"Leave P labels out" cross-validation is a cross-validation scheme which holds out the samples according to the labels (integers) coming from one of the columns of the design matrix. 

Each training set is thus constituted by all the samples except the ones related to a number of specific groups.

For example, if you have a "year" column in the design matrix (after preprocessing), this can be used to train on a set of years while validating on another previously-unseen year.

* Note that it is not possible to use a non-selected column.
* The complexity increases fast with the "P" argument, so you should generally keep it small

