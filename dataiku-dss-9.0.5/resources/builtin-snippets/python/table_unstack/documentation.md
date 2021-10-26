#### Example

Input rows:
    
    type    make         
    diesel  mazda             2
            mercedes-benz     4
    gas     alfa-romero       3
            audi              6
    ...

Here, the input has an index of depth of 2 (0: "type", 1: "make").
We can decide which level to unstack. Unstaking level 1 produces
output pivoted data which keep level 0 as index.

     make    mazda  mercedes-benz mercury mitsubishi  peugot ...
     type                                                   
     diesel      2              4                          5 ...
     gas        15              4       1         13       6 ...