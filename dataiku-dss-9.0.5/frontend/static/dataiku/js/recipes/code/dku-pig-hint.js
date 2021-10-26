(function () {
'use strict';

    var pigKeywords = "VOID IMPORT RETURNS DEFINE FILTER FOREACH ORDER CUBE DISTINCT COGROUP "
    + "JOIN CROSS UNION SPLIT INTO IF OTHERWISE ALL AS BY USING INNER OUTER ONSCHEMA PARALLEL "
    + "PARTITION GROUP AND OR NOT GENERATE FLATTEN ASC DESC IS STREAM THROUGH MAPREDUCE "
    + "SHIP CACHE INPUT OUTPUT STDERROR STDIN STDOUT DKUSTORE LIMIT SAMPLE LEFT RIGHT FULL EQ GT LT GTE LTE "
    + "NEQ MATCHES TRUE FALSE";
    var pigKeywordsU = pigKeywords.split(" ");

    var pigTypes = "BOOLEAN INT LONG FLOAT DOUBLE CHARARRAY BYTEARRAY BAG TUPLE MAP";
    var pigTypesU = pigTypes.split(" ");
    var pigTypesL = pigTypes.toLowerCase().split(" ");

    var pigBuiltins = "ABS ACOS ARITY ASIN ATAN AVG BAGSIZE BINSTORAGE BLOOM BUILDBLOOM CBRT CEIL "
    + "CONCAT COR COS COSH COUNT COUNT_STAR COV CONSTANTSIZE CUBEDIMENSIONS DIFF DISTINCT DOUBLEABS "
    + "DOUBLEAVG DOUBLEBASE DOUBLEMAX DOUBLEMIN DOUBLEROUND DOUBLESUM EXP FLOOR FLOATABS FLOATAVG "
    + "FLOATMAX FLOATMIN FLOATROUND FLOATSUM GENERICINVOKER INDEXOF INTABS INTAVG INTMAX INTMIN "
    + "INTSUM INVOKEFORDOUBLE INVOKEFORFLOAT INVOKEFORINT INVOKEFORLONG INVOKEFORSTRING INVOKER "
    + "ISEMPTY JSONLOADER JSONMETADATA JSONSTORAGE LAST_INDEX_OF LCFIRST LOG LOG10 LOWER LONGABS "
    + "LONGAVG LONGMAX LONGMIN LONGSUM MAX MIN MAPSIZE MONITOREDUDF NONDETERMINISTIC OUTPUTSCHEMA  "
    + "PIGSTORAGE PIGSTREAMING RANDOM REGEX_EXTRACT REGEX_EXTRACT_ALL REPLACE ROUND SIN SINH SIZE "
    + "SQRT STRSPLIT SUBSTRING SUM STRINGCONCAT STRINGMAX STRINGMIN STRINGSIZE TAN TANH TOBAG "
    + "TOKENIZE TOMAP TOP TOTUPLE TRIM TEXTLOADER TUPLESIZE UCFIRST UPPER UTF8STORAGECONVERTER";
    var pigBuiltinsU = pigBuiltins.split(" ").join("() ").split(" ");
    var pigBuiltinsC = ("BagSize BinStorage Bloom BuildBloom ConstantSize CubeDimensions DoubleAbs "
    + "DoubleAvg DoubleBase DoubleMax DoubleMin DoubleRound DoubleSum FloatAbs FloatAvg FloatMax "
    + "FloatMin FloatRound FloatSum GenericInvoker IntAbs IntAvg IntMax IntMin IntSum "
    + "InvokeForDouble InvokeForFloat InvokeForInt InvokeForLong InvokeForString Invoker "
    + "IsEmpty JsonLoader JsonMetadata JsonStorage LongAbs LongAvg LongMax LongMin LongSum MapSize "
    + "MonitoredUDF Nondeterministic OutputSchema PigStorage PigStreaming StringConcat StringMax "
    + "StringMin StringSize TextLoader TupleSize Utf8StorageConverter").split(" ").join("() ").split(" ");


  function maybeAdd(str,tkstr,list) {
      tkstr = (tkstr||'').trim().toLowerCase();
      var chkstr = (str||'').trim().toLowerCase();
      if (chkstr.indexOf(tkstr) == 0 && list.indexOf(str)==-1)  {
          list.push(str);
      }
  }

  function extractAllNamesRecursive(relations) {

      var out = [];

      if(!relations) {
          return out;
      }

      for(var k in relations) {
          var field = relations[k];
          if(field.name) {
              out.push(field.name);
          }
          if(field.fields) {
              out = out.concat(extractAllNamesRecursive(field.fields));
          }
      }

      return out.filter(function(elm,idx) { return out.indexOf(elm)==idx; });
  }

  function extractRootNames(relations) {

      var out = [];

      if(!relations) {
          return out;
      }

      for(var k in relations) {
          var field = relations[k];
          out.push(field.name);
      }

      return out;
  }

  function extractNonRootNames(relations ) {
      var root = extractRootNames(relations);
      var all = extractAllNamesRecursive(relations);

      return all.filter(function(elm) { return root.indexOf(elm)==-1; });
  }


  function namedToken(val) {
      var fn = function(tok) {
          var tokval = tok.string;
          return (tokval||'').toLowerCase() === (val||'').toLowerCase();
      };
      fn.ruleName = 'token "'+val+'"';
      return fn;
  }

  function typedToken(type) {
      var fn =  function(tok) {
          var toktype = tok.type;
          return (toktype||'').toLowerCase() === (type||'').toLowerCase();
      };
      fn.ruleName = 'type is "'+type+'"';
      return fn;
  }

  function anyToken() {
      var fn = function(tok) {
          return true;
      };
      fn.ruleName = 'any';
      return fn;
  }

  function nonSpaceToken() {
      var fn = function(tok) {
          return !(tok.string.trim()=='');
      };
      fn.ruleName = 'non-space';
      return fn;
  }


  function spaceToken() {
      var fn = function(tok) {
          return tok.string.trim()=='';
      };
      fn.ruleName = 'space';
      return fn;
  }

  function hasAll(predicates) {
      var fn = function(tok) {
          for(var k in predicates) {
              if(!predicates[k](tok)) {
                  return false;
              }
          }
          return true;
      };
      fn.ruleName = '(';
      for(var k in predicates) {
          if(fn.ruleName=='(') {
              fn.ruleName += predicates[k].ruleName;
          } else {
              fn.ruleName += ' and '+predicates[k].ruleName;
          }
      }
      fn.ruleName += ')';
      return fn;
  }

  function isNot(predicate) {
      var fn = function(tok) {
          return !predicate(tok);
      };
      fn.ruleName = 'not ('+predicate.ruleName+')';
      return fn;
  }

  function atLeastOneOf(predicates) {
      var fn = function(tok) {
          for(var k in predicates) {
              if(predicates[k](tok)) {
                  return true;
              }
          }
          return false;
      };
      fn.ruleName = '(';
      for(var k in predicates) {
          if(fn.ruleName=='(') {
              fn.ruleName += predicates[k].ruleName;
          } else {
              fn.ruleName += ' or '+predicates[k].ruleName;
          }
      }
      fn.ruleName += ')';
      return fn;
  }


  function addFixes(arr,prefix,suffix) {
      var out = [];
      for(var k in arr) {
          out.push(prefix+arr[k]+suffix);
      }
      return out;
  }


  var suggestDatabase = [];

  // DKULOAD statements
  suggestDatabase.push({
     pattern : [
          namedToken('DKULOAD'),
          spaceToken()
     ],
     suggest : {
         group : 1,
         values : function(context,replace) {
             return addFixes(context.inputs,replace+'\'','\';\n');
         }
     }
  });

  suggestDatabase.push({
      pattern : [
           namedToken('DKULOAD'),
           spaceToken(),
           nonSpaceToken()
      ],
      suggest : {
          group : 1,
          values : function(context,replace) {
              return addFixes(context.inputs,'\'','\';\n');
          }
      }
   });

  suggestDatabase.push({
      pattern : [
           namedToken('DKULOAD'),
      ],
      suggest : {
          group : 1,
          values : function(context,replace) {
              return addFixes(context.inputs,'DKULOAD \'','\';\n');
          }
      }
   });

  suggestDatabase.push({
      pattern : [
           nonSpaceToken(),
      ],
      suggest : {
          group : 1,
          values : function(context,replace) {
              return addFixes(context.inputs,'DKULOAD \'','\';\n');
          }
      }
   });


  // DKUSTORE statements
  suggestDatabase.push({
      pattern : [
           namedToken('DKUSTORE'),
           spaceToken(),
           nonSpaceToken(),
           spaceToken(),
           namedToken('INTO'),
           spaceToken(),
      ],
      suggest : {
          group : 1,
          values : function(context,replace) {
              return addFixes(context.outputs,replace+'\'','\';\n');
          }
      }
   });

  suggestDatabase.push({
      pattern : [
           namedToken('DKUSTORE'),
           spaceToken(),
           nonSpaceToken(),
           spaceToken(),
           nonSpaceToken(),
      ],
      suggest : {
          group : 1,
          values : function(context) {
              return addFixes(context.outputs,'INTO \'','\';\n');
          }
      }
   });

  suggestDatabase.push({
      pattern : [
           namedToken('DKUSTORE')
      ],
      suggest : {
          group : 1,
          values : function(context) {
              return addFixes(extractRootNames(context.relations),'DKUSTORE ',' INTO ');
          }
      }
   });

  suggestDatabase.push({
      pattern : [
           namedToken('DKUSTORE'),
           spaceToken()
      ],
      suggest : {
          group : 1,
          values : function(context,replace) {
              return addFixes(extractRootNames(context.relations),replace,' INTO ');
          }
      }
   });

  suggestDatabase.push({
      pattern : [
           namedToken('DKUSTORE'),
           spaceToken(),
           nonSpaceToken()
      ],
      suggest : {
          group : 1,
          values : function(context,replace) {
              return addFixes(extractRootNames(context.relations),'',' INTO ');
          }
      }
   });


  // Alias completion

  var followedByAlias = atLeastOneOf([
        namedToken('COGROUP'),
        namedToken('DISTINCT'),
        namedToken('CROSS'),
        namedToken('FILTER'),
        namedToken('FOREACH'),
        namedToken('GROUP'),
        namedToken('JOIN'),
        namedToken('LIMIT'),
        namedToken('ORDER'),
        namedToken('SPLIT'),
        namedToken('STORE'),
        namedToken('SAMPLE'),
        namedToken('STREAM'),
        namedToken('UNION'),
        namedToken(','),
        namedToken('DUMP'),
        namedToken('ILLUSTRATE')
   ]);


  suggestDatabase.push({
      pattern : [
            followedByAlias
      ],
      suggest : {
          group : 0,
          values : function(context,replace) {
              return addFixes(extractRootNames(context.relations),replace+' ',' ');
          }
      }
   });

  suggestDatabase.push({
      pattern : [
            followedByAlias,
            spaceToken()
      ],
      suggest : {
          group : 1,
          values : function(context,replace) {
              return addFixes(extractRootNames(context.relations),' ',' ');
          }
      }
   });

  // Std statements : XXX alias XXX

  function addUsualStatement(w1,w2) {
      suggestDatabase.push({
          pattern : [
                namedToken(w1),
                spaceToken(),
                nonSpaceToken(),
                spaceToken()
          ],
          suggest : {
              group : 1,
              values : function(context,replace) {
                  return [replace+w2+' '];
              }
          }
       });
  }

  addUsualStatement('FOREACH','GENERATE');
  addUsualStatement('ORDER','BY');
  addUsualStatement('JOIN','BY');
  addUsualStatement('FILTER','BY');
  addUsualStatement('UNION',',');

  // Fields completion

  suggestDatabase.push({
      pattern : [
           namedToken('.'),
      ],
      suggest : {
          group : 0,
          values : function(context,replace) {
              return addFixes(extractNonRootNames(context.relations),replace,'');
          }
      }
   });

  // Fields completion

  suggestDatabase.push({
      pattern : [
           namedToken('.'),
           nonSpaceToken()
      ],
      suggest : {
          group : 0,
          values : function(context,replace) {
              return addFixes(extractNonRootNames(context.relations),'','');
          }
      }
   });

  // Type completion

  suggestDatabase.push({
      pattern : [
           hasAll([
               namedToken(':'),
               isNot(typedToken('error'))
           ])
      ],
      suggest : {
          group : 2,
          values : function(context,replace) {
              return addFixes(pigTypesL,replace,'');
          }
      }
   });

  // Complete after "="

  suggestDatabase.push({
      pattern : [
           namedToken('=')
      ],
      suggest : {
          group : 2,
          values : function() {
              return addFixes([].concat(pigBuiltinsU, pigBuiltinsC, pigTypesU,pigKeywordsU),replace+' ',' ');
          }
      }
   });

  // Non contextual completion
  suggestDatabase.push({
      pattern : [
           anyToken()
      ],
      suggest : {
          group : 2,
          values : function() {
              return addFixes([].concat(pigBuiltinsU, pigBuiltinsC, pigTypesU,pigKeywordsU),'',' ');
          }
      }
   });

  // Contextual
  suggestDatabase.push({
      pattern : [
           nonSpaceToken()
      ],
      suggest : {
          group : 1,
          values : function(context,replace) {
              return addFixes(extractAllNamesRecursive(context.relations),'',' ');
          }
      }
   });

  suggestDatabase.push({
      pattern : [
            atLeastOneOf([
                 namedToken(','),
                 spaceToken()
            ])
      ],
      suggest : {
          group : 2,
          values : function(context,replace) {
              return addFixes(extractAllNamesRecursive(context.relations),replace,' ');
          }
      }
   });

  function pigHintWithContext(editor,ctx) {

      var context = {inputs:[],outputs:[],relations:[]};

      if(ctx) {
          context = ctx;
      }

      var cur = editor.getCursor();
      var tokens = [];
      var ch = cur.ch;
      var lastAddedTokenLine = -1;
      var lastAddedTokenCh = -1;
      var stop = false;

      // TODO : find another (faster) way to gather token list...
      for(var l = cur.line ; !stop && l >= 0 ; l--) {
          for(var i = ch ; !stop && i >= 0 ; i--) {
              var currentToken = editor.getTokenAt({line:l,ch:i});
              if(currentToken.string.length>0 && currentToken.string[0]==';') {
                  stop = true;
              }
              if(!stop && (currentToken.start!=lastAddedTokenCh || l != lastAddedTokenLine)) {

                  var nextTokenIsSpace=false;
                  if(tokens.length>0 && spaceToken()(tokens[0])) {
                      nextTokenIsSpace = true;
                  }
                  if((spaceToken()(currentToken) && !nextTokenIsSpace) || !spaceToken()(currentToken)) {
                      tokens.unshift(currentToken);
                  }

                  lastAddedTokenLine = l;
                  lastAddedTokenCh = currentToken.start;
              }

          }
          if(l>0) {
              ch = editor.getLine(l-1).length;
          }
      }

      tokens.unshift({string:'',type:'begin',start:0,end:0});


      // Init groups
      var producedCompletions = [];

      for(var k in suggestDatabase) {
          while(suggestDatabase[k].suggest.group+1>producedCompletions.length) {
              producedCompletions.push([]);
          }
      }

      // Apply matching rules
      var matchedRules=0;
      // console.log('Begin pattern matching');
      for(var k in suggestDatabase) {
          var suggestion = suggestDatabase[k];
          var ok = suggestion.pattern.length<=tokens.length;
          for(var i = tokens.length-1, j = suggestion.pattern.length-1 ; ok && i >= 0 && j >= 0 ; i--,j--) {
              if(!suggestion.pattern[j](tokens[i],context)) {
                  ok=false;
              }
          }
          if(ok) {
              // var logString = 'Matched pattern : ';
              // for(var k in suggestion.pattern) {
              //     logString+=((k>0?' > ':'')+ suggestion.pattern[k].ruleName);
              // }

              var production = suggestion.suggest.values(context,tokens[tokens.length-1].string,tokens);
              // logString += ' ('+production.length +' productions)';
              producedCompletions[suggestion.suggest.group] = producedCompletions[suggestion.suggest.group].concat(production);
              matchedRules++;
              // console.log(logString);
          }
      }

      // if(matchedRules==0) {
      //     console.log('No matched pattern');
      // }

      // Sort each group
      for(var i = 0 ; i < producedCompletions.length ; i++) {
          producedCompletions[i].sort();
      }

      // Remove empty groups
      var hasEmptyGroup = true;

      while(hasEmptyGroup) {
          for(var i = 0 ; i < producedCompletions.length ; i++) {
              if(producedCompletions[i].length == 0) {
                  producedCompletions.splice(i,1);
                  break;
              }
          }
          hasEmptyGroup = false;
      }

      // Filtering
      var filteredCompletionList = [];
      for(var i = 0 ; i < producedCompletions.length ; i++) {
          var completions = producedCompletions[i];
          for(var j in completions) {
              maybeAdd(completions[j],tokens[tokens.length-1].string,filteredCompletionList);
          }
      }

      // Deduplicate
      var set = {};
      var finalCompletionList = [];
      for(var i = 0 ; i < filteredCompletionList.length ; i++) {
          var str = filteredCompletionList[i];
          if(set[str]) {
              continue;
          }
          finalCompletionList.push(str);
          set[str] = true;
      }

      return {list:finalCompletionList,from:{line:cur.line,ch:tokens[tokens.length-1].start},to:{line:cur.line,ch:tokens[tokens.length-1].end}};

  }

  CodeMirror.pigHintWithContext = pigHintWithContext;


})();