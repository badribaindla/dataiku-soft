#### Example

Input wide data: 

    make    mazda  mercedes-benz mercury mitsubishi  peugot ...
    type                                                   
    diesel      2              4                          5 ...
    gas        15              4       1         13       6 ...

Output stacked data:

    type    make         
    diesel  mazda             2
            mercedes-benz     4
            nissan            1
    gas     alfa-romero       3
            audi              6
    ...

One can also keep missing values of the wide data yielding to stacked data cross product index.

    type    make         
    diesel  alfa-romero     NaN
            audi            NaN
            mazda             2
            nissan            1
            mercury         NaN
    gas     alfa-romero       3
            audi              6
    ...