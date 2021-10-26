
#### Example

Input rows:

         type           make  qty
    0  diesel          mazda    2
    1  gas     mercedes-benz    4
    2  diesel         nissan    1
    3  gas            peugot    5
    4  diesel         toyota    3
    ...

Output pivoted data:

     make    mazda  mercedes-benz mercury mitsubishi  peugot ...
     type                                                   
     diesel      2              4                          5 ...
     gas        15              4       1         13       6 ...
