// Curated Stata command/function tables. Kept free of `vscode` imports so it can be unit tested.

export type CommandCategory =
    | 'data'
    | 'estimation'
    | 'postestimation'
    | 'graphics'
    | 'programming'
    | 'prefix'
    | 'files'
    | 'panel'
    | 'survival'
    | 'reporting'
    | 'frames'
    | 'community'
    | 'utility';

export interface StataCommand {
    name: string;
    /** Shortest valid abbreviation (equals `name` when the command cannot be abbreviated). */
    minAbbrev: string;
    category: CommandCategory;
    signature: string;
    doc: string;
}

export interface StataFunction {
    name: string;
    signature: string;
    doc: string;
}

// [name, minimum abbreviation ('' = none), category, signature, description]
type Row = [string, string, CommandCategory, string, string];

const COMMAND_ROWS: Row[] = [
    // ---- Data management -------------------------------------------------
    ['use', '', 'data', 'use [varlist] [if] [in] using filename [, clear nolabel]', 'Load a Stata dataset (.dta) into memory.'],
    ['save', 'sa', 'data', 'save [filename] [, replace nolabel emptyok]', 'Save the dataset in memory to disk.'],
    ['saveold', '', 'data', 'saveold filename [, version(#) replace]', 'Save dataset in a format readable by older Stata versions.'],
    ['sysuse', '', 'data', 'sysuse ["]filename["] [, clear]', 'Load an example dataset shipped with Stata (e.g. `sysuse auto`).'],
    ['webuse', '', 'data', 'webuse ["]filename["] [, clear]', 'Load an example dataset from the Stata website.'],
    ['clear', '', 'data', 'clear [all | mata | results | matrix | programs | ado | frames]', 'Clear data and/or other objects from memory.'],
    ['describe', 'd', 'data', 'describe [varlist] [, short fullnames numbers]', 'Describe the dataset in memory or a file.'],
    ['codebook', '', 'data', 'codebook [varlist] [if] [in] [, compact problems]', 'Describe data contents in detail.'],
    ['inspect', '', 'data', 'inspect [varlist] [if] [in]', 'Display simple summary of data attributes.'],
    ['lookfor', '', 'data', 'lookfor string [string ...]', 'Search variable names and labels for a string.'],
    ['list', 'l', 'data', 'list [varlist] [if] [in] [, noobs clean separator(#) abbreviate(#)]', 'List values of variables.'],
    ['browse', 'br', 'data', 'browse [varlist] [if] [in] [, nolabel]', 'Open the dataset in the Data Explorer (read-only).'],
    ['edit', 'ed', 'data', 'edit [varlist] [if] [in] [, nolabel]', 'Open the data editor.'],
    ['count', 'cou', 'data', 'count [if] [in]', 'Count observations satisfying a condition. Result in `r(N)`.'],
    ['generate', 'g', 'data', 'generate [type] newvar[:lblname] = exp [if] [in] [, before(varname) after(varname)]', 'Create a new variable.'],
    ['replace', '', 'data', 'replace oldvar = exp [if] [in] [, nopromote]', 'Replace contents of an existing variable.'],
    ['egen', '', 'data', 'egen [type] newvar = fcn(arguments) [if] [in] [, options]', 'Extensions to generate (group, mean, total, rank, tag, rowmean, ...).'],
    ['drop', '', 'data', 'drop varlist | drop if exp | drop in range', 'Drop variables or observations.'],
    ['keep', '', 'data', 'keep varlist | keep if exp | keep in range', 'Keep variables or observations.'],
    ['rename', 'ren', 'data', 'rename old new | rename (old1 old2 ...) (new1 new2 ...)', 'Rename one or more variables.'],
    ['order', '', 'data', 'order varlist [, first last before(varname) after(varname) alphabetic]', 'Reorder variables in the dataset.'],
    ['sort', '', 'data', 'sort varlist [in] [, stable]', 'Sort data in ascending order.'],
    ['gsort', '', 'data', 'gsort [+|-]varname [[+|-]varname ...] [, generate(newvar) mfirst]', 'Sort in ascending or descending order.'],
    ['label', 'la', 'data', 'label variable varname "label" | label define lblname # "label" ... | label values varlist lblname', 'Manipulate variable and value labels.'],
    ['labelbook', '', 'data', 'labelbook [lblname-list] [, problems detail]', 'Describe value labels.'],
    ['numlabel', '', 'data', 'numlabel [lblnamelist], {add|remove} [mask(str)]', 'Add or remove numeric values from value labels.'],
    ['notes', '', 'data', 'notes [evarname]: text', 'Place notes in the dataset.'],
    ['format', '', 'data', 'format varlist %fmt', 'Set the display format of variables.'],
    ['recast', '', 'data', 'recast type varlist [, force]', 'Change storage type of variables.'],
    ['compress', '', 'data', 'compress [varlist]', 'Compress data in memory by demoting storage types.'],
    ['destring', '', 'data', 'destring [varlist], {generate(newvarlist)|replace} [ignore("chars") force]', 'Convert string variables to numeric.'],
    ['tostring', '', 'data', 'tostring varlist, {generate(newvarlist)|replace} [format(%fmt) force]', 'Convert numeric variables to string.'],
    ['encode', '', 'data', 'encode varname [if] [in], generate(newvar) [label(name) noextend]', 'Encode a string variable into a labeled numeric variable.'],
    ['decode', '', 'data', 'decode varname [if] [in], generate(newvar) [maxlength(#)]', 'Create a string variable from a labeled numeric variable.'],
    ['recode', '', 'data', 'recode varlist (rule) [(rule) ...] [, generate(newvar) prefix(str)]', 'Recode categorical variables.'],
    ['mvencode', '', 'data', 'mvencode varlist [if] [in], mv(# | mvc=# [\\ ...]) [override]', 'Change missing values to numeric values.'],
    ['mvdecode', '', 'data', 'mvdecode varlist [if] [in], mv(numlist | numlist=mvc [\\ ...])', 'Change numeric values to missing.'],
    ['merge', '', 'data', 'merge {1:1|m:1|1:m|m:m} varlist using filename [, keep() keepusing() generate() nogenerate update replace]', 'Merge datasets.'],
    ['append', '', 'data', 'append using filename [filename ...] [, generate(newvar) keep(varlist) force]', 'Append datasets.'],
    ['joinby', '', 'data', 'joinby [varlist] using filename [, unmatched(none|both|master|using)]', 'Form all pairwise combinations within groups.'],
    ['cross', '', 'data', 'cross using filename', 'Form every pairwise combination of two datasets.'],
    ['reshape', '', 'data', 'reshape {long|wide} stubnames, i(varlist) j(varname) [string]', 'Convert data between wide and long form.'],
    ['collapse', '', 'data', 'collapse clist [if] [in] [weight] [, by(varlist) cw fast]', 'Make dataset of summary statistics (e.g. `(mean) x (sum) y`).'],
    ['contract', '', 'data', 'contract varlist [if] [in] [weight] [, freq(newvar) percent(newvar) zero]', 'Make dataset of frequencies and percentages.'],
    ['expand', '', 'data', 'expand [=]exp [if] [in] [, generate(newvar)]', 'Duplicate observations.'],
    ['fillin', '', 'data', 'fillin varlist', 'Rectangularize dataset.'],
    ['xpose', '', 'data', 'xpose, clear [varname format(%fmt)]', 'Interchange observations and variables.'],
    ['stack', '', 'data', 'stack varlist [if] [in], into(newvars) [clear wide]', 'Stack data.'],
    ['sample', '', 'data', 'sample # [if] [in] [, count by(groupvars)]', 'Draw a random sample.'],
    ['duplicates', '', 'data', 'duplicates {report|examples|list|tag|drop} [varlist] [, force generate(newvar)]', 'Report, tag, or drop duplicate observations.'],
    ['isid', '', 'data', 'isid varlist [using filename] [, sort missok]', 'Check whether variables uniquely identify observations.'],
    ['levelsof', '', 'data', 'levelsof varname [if] [in] [, clean local(macname) separate(sep) missing]', 'Store the distinct values of a variable in a macro.'],
    ['split', '', 'data', 'split strvar [if] [in] [, generate(stub) parse(pchars) destring]', 'Split a string variable into parts.'],
    ['separate', '', 'data', 'separate varname [if] [in], by(byvar|exp) [generate(stubname)]', 'Create separate variables by group.'],
    ['clonevar', '', 'data', 'clonevar newvar = varname [if] [in]', 'Clone an existing variable, including labels and formats.'],
    ['corr2data', '', 'data', 'corr2data newvarlist [, n(#) means(vector) corr(matrix)]', 'Create dataset with specified correlation structure.'],
    ['drawnorm', '', 'data', 'drawnorm newvarlist [, n(#) means(vector) corr(matrix) sds(vector) seed(#)]', 'Draw a sample from a multivariate normal distribution.'],
    ['set', '', 'utility', 'set setting value', 'Set Stata system parameters (e.g. `set obs`, `set seed`, `set more off`).'],
    ['input', '', 'data', 'input [type] varname [type varname ...]', 'Enter data from the keyboard/do-file, terminated by `end`.'],
    ['insheet', '', 'files', 'insheet [varlist] using filename [, comma tab names clear]', 'Read text data (superseded by `import delimited`).'],
    ['infile', '', 'files', 'infile varlist using filename [if] [in] [, clear]', 'Read unformatted text data.'],
    ['infix', '', 'files', 'infix using dfilename [if] [in] [, using(filename) clear]', 'Read fixed-format text data.'],
    ['import', '', 'files', 'import {delimited|excel|sas|spss|fred|haver} [using] filename [, clear options]', 'Import data from other formats (CSV, Excel, SAS, SPSS, ...).'],
    ['export', '', 'files', 'export {delimited|excel|sasxport8} [varlist] using filename [if] [in] [, replace options]', 'Export data to other formats.'],
    ['outsheet', '', 'files', 'outsheet [varlist] using filename [if] [in] [, comma replace]', 'Write text data (superseded by `export delimited`).'],
    ['odbc', '', 'files', 'odbc load [extvarlist] [if] [in], {table("TableName")|exec("SqlStmt")} [dsn("DsnName") clear]', 'Load, write, or view data from ODBC sources.'],
    ['tsset', '', 'panel', 'tsset [panelvar] timevar [, format(%fmt) delta(#)]', 'Declare data to be time-series data.'],
    ['tsfill', '', 'panel', 'tsfill [, full]', 'Fill in gaps in time variable.'],
    ['xtset', '', 'panel', 'xtset panelvar [timevar] [, delta(#)]', 'Declare data to be panel data.'],
    ['xtdescribe', 'xtdes', 'panel', 'xtdescribe [if] [in] [, patterns(#) width(#)]', 'Describe pattern of panel data.'],
    ['xtsum', '', 'panel', 'xtsum [varlist] [if]', 'Summarize panel data (overall, between, within).'],
    ['xttab', '', 'panel', 'xttab varname [if]', 'Tabulate panel data.'],
    ['xtline', '', 'panel', 'xtline varlist [if] [in] [, overlay i(varname) t(varname)]', 'Panel-data line plots.'],
    ['mi', '', 'data', 'mi {set|register|impute|estimate|describe|...} ...', 'Multiple imputation suite.'],
    ['char', '', 'data', 'char evarname[charname] ["text"]', 'Define characteristics of variables or the dataset.'],
    ['assert', '', 'programming', 'assert exp [if] [in] [, rc0 null fast]', 'Verify that an expression is true for all observations.'],
    ['preserve', '', 'programming', 'preserve', 'Preserve data so it can be restored later with `restore`.'],
    ['restore', '', 'programming', 'restore [, not preserve]', 'Restore data saved with `preserve`.'],
    ['snapshot', '', 'programming', 'snapshot {save|restore #|list|erase} [, label("label")]', 'Save and restore data snapshots.'],

    // ---- Summary statistics & tables --------------------------------------
    ['summarize', 'su', 'reporting', 'summarize [varlist] [if] [in] [weight] [, detail meanonly format separator(#)]', 'Summary statistics. Results stored in `r()`.'],
    ['tabulate', 'ta', 'reporting', 'tabulate varname [varname] [if] [in] [weight] [, missing row col cell chi2 nofreq generate(stub)]', 'One- and two-way tables of frequencies.'],
    ['tab1', '', 'reporting', 'tab1 varlist [if] [in] [weight] [, missing]', 'One-way tables for each variable.'],
    ['tab2', '', 'reporting', 'tab2 varlist [if] [in] [weight] [, options]', 'All possible two-way tabulations.'],
    ['tabstat', '', 'reporting', 'tabstat varlist [if] [in] [weight] [, statistics(statname ...) by(varname) columns(variables|statistics)]', 'Compact table of summary statistics.'],
    ['table', '', 'reporting', 'table (rowvars) (colvars) [(tabvars)] [if] [in] [weight] [, statistic(stat varlist) nototals]', 'Tables of frequencies, summaries, and command results (Stata 17+ collect-based).'],
    ['dtable', '', 'reporting', 'dtable [varlist] [if] [in] [weight] [, by(varname) export(filename)]', 'Create a table of descriptive statistics ("Table 1").'],
    ['etable', '', 'reporting', 'etable [, estimates(namelist) column(spec) cstat(stat) export(filename)]', 'Create a table of estimation results.'],
    ['collect', '', 'reporting', 'collect [get|style|layout|export|preview|label|dims|levelsof|clear] ...', 'Collect and customize results from Stata commands into tables.'],
    ['correlate', 'cor', 'reporting', 'correlate [varlist] [if] [in] [weight] [, means covariance]', 'Correlations (covariances) of variables.'],
    ['pwcorr', '', 'reporting', 'pwcorr [varlist] [if] [in] [weight] [, obs sig star(#) bonferroni]', 'Pairwise correlation coefficients.'],
    ['spearman', '', 'reporting', 'spearman [varlist] [if] [in] [, stats(list)]', 'Spearman rank correlation.'],
    ['ttest', '', 'reporting', 'ttest varname == # [if] [in] | ttest varname [if] [in], by(groupvar) [unequal]', 'Mean-comparison t tests.'],
    ['prtest', '', 'reporting', 'prtest varname == #p [if] [in] [, level(#)]', 'Tests of proportions.'],
    ['ranksum', '', 'reporting', 'ranksum varname [if] [in], by(groupvar)', 'Wilcoxon rank-sum (Mann-Whitney) test.'],
    ['signrank', '', 'reporting', 'signrank varname = exp [if] [in]', 'Wilcoxon matched-pairs signed-rank test.'],
    ['kwallis', '', 'reporting', 'kwallis varname [if] [in], by(groupvar)', 'Kruskal-Wallis equality-of-populations rank test.'],
    ['ci', '', 'reporting', 'ci {means|proportions|variances} [varlist] [if] [in] [, level(#)]', 'Confidence intervals.'],
    ['mean', '', 'reporting', 'mean varlist [if] [in] [weight] [, over(varlist) vce(vcetype)]', 'Estimate means with standard errors.'],
    ['proportion', '', 'reporting', 'proportion varlist [if] [in] [weight] [, over(varlist)]', 'Estimate proportions.'],
    ['total', '', 'reporting', 'total varlist [if] [in] [weight] [, over(varlist)]', 'Estimate totals.'],
    ['centile', '', 'reporting', 'centile [varlist] [if] [in] [, centile(numlist)]', 'Report centile and confidence interval.'],
    ['pctile', '', 'reporting', 'pctile [type] newvar = exp [if] [in] [weight] [, nquantiles(#) genp(newvar)]', 'Create variable containing percentiles.'],
    ['xtile', '', 'reporting', 'xtile newvar = exp [if] [in] [weight] [, nquantiles(#) cutpoints(varname)]', 'Create variable containing quantile categories.'],
    ['histogram', 'hist', 'graphics', 'histogram varname [if] [in] [weight] [, bin(#) width(#) discrete percent frequency normal kdensity]', 'Histograms for continuous and categorical variables.'],

    // ---- Estimation --------------------------------------------------------
    ['regress', 'reg', 'estimation', 'regress depvar [indepvars] [if] [in] [weight] [, noconstant vce(robust|cluster clustvar) level(#) beta]', 'Linear regression (OLS).'],
    ['areg', '', 'estimation', 'areg depvar [indepvars] [if] [in] [weight], absorb(varname) [vce(vcetype)]', 'Linear regression with a large dummy-variable set.'],
    ['ivregress', '', 'estimation', 'ivregress {2sls|liml|gmm} depvar [varlist1] (varlist2 = varlist_iv) [if] [in] [weight] [, vce(vcetype) first]', 'Single-equation instrumental-variables regression.'],
    ['logit', '', 'estimation', 'logit depvar [indepvars] [if] [in] [weight] [, or vce(vcetype)]', 'Logistic regression, reporting coefficients.'],
    ['logistic', '', 'estimation', 'logistic depvar indepvars [if] [in] [weight] [, vce(vcetype)]', 'Logistic regression, reporting odds ratios.'],
    ['probit', '', 'estimation', 'probit depvar [indepvars] [if] [in] [weight] [, vce(vcetype)]', 'Probit regression.'],
    ['mlogit', '', 'estimation', 'mlogit depvar [indepvars] [if] [in] [weight] [, baseoutcome(#) rrr]', 'Multinomial (polytomous) logistic regression.'],
    ['ologit', '', 'estimation', 'ologit depvar [indepvars] [if] [in] [weight] [, or]', 'Ordered logistic regression.'],
    ['oprobit', '', 'estimation', 'oprobit depvar [indepvars] [if] [in] [weight]', 'Ordered probit regression.'],
    ['clogit', '', 'estimation', 'clogit depvar [indepvars] [if] [in] [weight], group(varname) [or]', 'Conditional (fixed-effects) logistic regression.'],
    ['poisson', '', 'estimation', 'poisson depvar [indepvars] [if] [in] [weight] [, exposure(varname) offset(varname) irr]', 'Poisson regression.'],
    ['nbreg', '', 'estimation', 'nbreg depvar [indepvars] [if] [in] [weight] [, exposure(varname) irr]', 'Negative binomial regression.'],
    ['zip', '', 'estimation', 'zip depvar [indepvars] [if] [in] [weight], inflate(varlist[, offset(varname)]|_cons)', 'Zero-inflated Poisson regression.'],
    ['tobit', '', 'estimation', 'tobit depvar [indepvars] [if] [in] [weight] [, ll[(#)] ul[(#)]]', 'Tobit regression.'],
    ['truncreg', '', 'estimation', 'truncreg depvar [indepvars] [if] [in] [weight] [, ll(varname|#) ul(varname|#)]', 'Truncated regression.'],
    ['heckman', '', 'estimation', 'heckman depvar [indepvars], select([depvar_s =] varlist_s) [twostep]', 'Heckman selection model.'],
    ['glm', '', 'estimation', 'glm depvar [indepvars] [if] [in] [weight] [, family(familyname) link(linkname) vce(vcetype)]', 'Generalized linear models.'],
    ['qreg', '', 'estimation', 'qreg depvar [indepvars] [if] [in] [weight] [, quantile(#) vce(vcetype)]', 'Quantile regression.'],
    ['sqreg', '', 'estimation', 'sqreg depvar [indepvars] [if] [in] [, quantiles(#[#...]) reps(#)]', 'Simultaneous-quantile regression.'],
    ['rreg', '', 'estimation', 'rreg depvar [indepvars] [if] [in] [, genwt(newvar)]', 'Robust regression.'],
    ['nl', '', 'estimation', 'nl (depvar = <sexp>) [if] [in] [weight] [, options]', 'Nonlinear least-squares estimation.'],
    ['ml', '', 'estimation', 'ml model method progname (eq) ... | ml maximize', 'Maximum likelihood estimation.'],
    ['gmm', '', 'estimation', 'gmm (eqname: <mexp>) [if] [in] [weight], instruments(varlist) [options]', 'Generalized method of moments estimation.'],
    ['sureg', '', 'estimation', 'sureg (depvar1 varlist1) (depvar2 varlist2) ... [if] [in] [weight]', 'Zellner\'s seemingly unrelated regression.'],
    ['reg3', '', 'estimation', 'reg3 (depvar1 varlist1) (depvar2 varlist2) ... [if] [in] [weight]', 'Three-stage estimation for systems of simultaneous equations.'],
    ['mvreg', '', 'estimation', 'mvreg depvars = indepvars [if] [in] [weight]', 'Multivariate regression.'],
    ['anova', '', 'estimation', 'anova varname [termlist] [if] [in] [weight] [, repeated(varlist)]', 'Analysis of variance and covariance.'],
    ['oneway', '', 'estimation', 'oneway response_var factor_var [if] [in] [weight] [, bonferroni tabulate]', 'One-way analysis of variance.'],
    ['manova', '', 'estimation', 'manova depvarlist = termlist [if] [in] [weight]', 'Multivariate analysis of variance and covariance.'],
    ['newey', '', 'estimation', 'newey depvar [indepvars] [if] [in] [weight], lag(#) [noconstant]', 'Regression with Newey-West standard errors.'],
    ['prais', '', 'estimation', 'prais depvar [indepvars] [if] [in] [, corc twostep rhotype(rhomethod)]', 'Prais-Winsten and Cochrane-Orcutt regression.'],
    ['arima', '', 'estimation', 'arima depvar [indepvars] [if] [in] [weight] [, arima(#p,#d,#q) ar(numlist) ma(numlist)]', 'ARIMA, ARMAX, and other dynamic regression models.'],
    ['arch', '', 'estimation', 'arch depvar [indepvars] [if] [in] [weight] [, arch(numlist) garch(numlist)]', 'Autoregressive conditional heteroskedasticity family of estimators.'],
    ['var', '', 'estimation', 'var depvarlist [if] [in] [, lags(numlist) exog(varlist)]', 'Vector autoregressive models.'],
    ['vec', '', 'estimation', 'vec varlist [if] [in] [, rank(#) lags(#) trend(trend)]', 'Vector error-correction models.'],
    ['xtreg', '', 'panel', 'xtreg depvar [indepvars] [if] [in] [weight] [, fe | re | be | mle | pa] [vce(vcetype)]', 'Fixed-, between-, and random-effects linear panel models.'],
    ['xtlogit', '', 'panel', 'xtlogit depvar [indepvars] [if] [in] [weight] [, fe | re | pa]', 'Panel-data logit models.'],
    ['xtprobit', '', 'panel', 'xtprobit depvar [indepvars] [if] [in] [weight] [, re | pa]', 'Panel-data probit models.'],
    ['xtpoisson', '', 'panel', 'xtpoisson depvar [indepvars] [if] [in] [weight] [, fe | re | pa]', 'Panel-data Poisson models.'],
    ['xtivreg', '', 'panel', 'xtivreg depvar [varlist1] (varlist2 = varlist_iv) [if] [in] [, fe | re | be | fd]', 'Instrumental variables panel-data models.'],
    ['xtabond', '', 'panel', 'xtabond depvar [indepvars] [if] [in] [, lags(#) maxldep(#) twostep vce(robust)]', 'Arellano-Bond linear dynamic panel-data estimation.'],
    ['xtgls', '', 'panel', 'xtgls depvar [indepvars] [if] [in] [weight] [, panels(iid|heteroskedastic|correlated) corr(independent|ar1|psar1)]', 'Panel-data models using GLS.'],
    ['xtmixed', '', 'panel', 'xtmixed depvar fe_eqn [|| re_eqn] [, options]', 'Multilevel mixed-effects linear regression (old name for `mixed`).'],
    ['xtdidregress', '', 'panel', 'xtdidregress (ovar omvarlist) (tvar) [if] [in] [weight], group(gvar) time(tmvar)', 'Difference-in-differences estimation for panel data.'],
    ['didregress', '', 'estimation', 'didregress (ovar omvarlist) (tvar) [if] [in] [weight], group(gvar) time(tmvar)', 'Difference-in-differences estimation for repeated cross-sections.'],
    ['mixed', '', 'estimation', 'mixed depvar fe_eqn [|| re_eqn] [|| re_eqn] [if] [in] [weight] [, options]', 'Multilevel mixed-effects linear regression.'],
    ['melogit', '', 'estimation', 'melogit depvar fe_eqn [|| re_eqn] [, options]', 'Multilevel mixed-effects logistic regression.'],
    ['meglm', '', 'estimation', 'meglm depvar fe_eqn [|| re_eqn] [, family(family) link(link)]', 'Multilevel mixed-effects generalized linear model.'],
    ['sem', '', 'estimation', 'sem paths [if] [in] [weight] [, options]', 'Structural equation model estimation.'],
    ['gsem', '', 'estimation', 'gsem paths [if] [in] [weight] [, options]', 'Generalized structural equation model estimation.'],
    ['factor', '', 'estimation', 'factor varlist [if] [in] [weight] [, pf | pcf | ipf | ml] [factors(#)]', 'Factor analysis.'],
    ['pca', '', 'estimation', 'pca varlist [if] [in] [weight] [, components(#) mineigen(#)]', 'Principal component analysis.'],
    ['cluster', '', 'estimation', 'cluster {kmeans|kmedians|singlelinkage|...} [varlist] [, k(#) name(clname)]', 'Cluster analysis of a dataset.'],
    ['teffects', '', 'estimation', 'teffects {ra|ipw|ipwra|aipw|nnmatch|psmatch} (ovar omvarlist) (tvar tmvarlist) [, ate atet]', 'Treatment-effects estimation for observational data.'],
    ['stteffects', '', 'survival', 'stteffects {ra|ipw|ipwra|wra} (omvarlist) (tvar tmvarlist) [, options]', 'Treatment-effects estimation for survival-time data.'],
    ['lasso', '', 'estimation', 'lasso {linear|logit|probit|poisson} depvar [(alwaysvars)] othervars [if] [in] [, selection(cv|adaptive|plugin)]', 'Lasso for prediction and model selection.'],
    ['dsregress', '', 'estimation', 'dsregress depvar varsofinterest [if] [in], controls([(alwaysvars)] othervars)', 'Double-selection lasso linear regression.'],
    ['bayes', '', 'prefix', 'bayes [, bayesopts] : estimation_command', 'Bayesian regression models using the `bayes` prefix.'],
    ['stset', '', 'survival', 'stset timevar [if] [weight] [, failure(failvar[==numlist]) id(idvar) origin() enter() exit()]', 'Declare data to be survival-time data.'],
    ['stcox', '', 'survival', 'stcox [varlist] [if] [in] [, nohr strata(varnames) vce(vcetype)]', 'Cox proportional hazards model.'],
    ['streg', '', 'survival', 'streg [varlist] [if] [in] [, distribution(exponential|weibull|gompertz|...) nohr]', 'Parametric survival models.'],
    ['sts', '', 'survival', 'sts {graph|list|test|generate} [varlist] [if] [in] [, by(varlist)]', 'Kaplan-Meier survivor function: graph, list, test, generate.'],
    ['stsplit', '', 'survival', 'stsplit newvar [if], {at(numlist)|every(#)}', 'Split and join time-span records.'],
    ['svyset', '', 'estimation', 'svyset [psu] [weight] [, strata(varname) fpc(varname) vce(linearized|brr|jackknife)]', 'Declare survey design for dataset.'],

    // ---- Postestimation ----------------------------------------------------
    ['predict', '', 'postestimation', 'predict [type] newvar [if] [in] [, xb stdp residuals pr]', 'Obtain predictions, residuals, etc., after estimation.'],
    ['margins', '', 'postestimation', 'margins [marginlist] [if] [in] [weight] [, dydx(varlist) at(atspec) atmeans post]', 'Marginal means, predictive margins, and marginal effects.'],
    ['marginsplot', '', 'postestimation', 'marginsplot [, recast(plottype) xdimension(dimlist) noci]', 'Graph results from margins.'],
    ['test', '', 'postestimation', 'test coeflist | test exp = exp [= ...] [, accumulate notest]', 'Wald tests of simple and composite linear hypotheses.'],
    ['testparm', '', 'postestimation', 'testparm varlist [, equal equation(eqname)]', 'Test that coefficients of listed variables are zero.'],
    ['testnl', '', 'postestimation', 'testnl exp = exp [= exp ...]', 'Test nonlinear hypotheses after estimation.'],
    ['lincom', '', 'postestimation', 'lincom exp [, level(#) eform]', 'Linear combinations of parameters.'],
    ['nlcom', '', 'postestimation', 'nlcom [name:]exp [, level(#) post]', 'Nonlinear combinations of estimators.'],
    ['contrast', '', 'postestimation', 'contrast termlist [, overall effects]', 'Contrasts and linear hypothesis tests after estimation.'],
    ['pwcompare', '', 'postestimation', 'pwcompare marginlist [, mcompare(method) effects]', 'Pairwise comparisons.'],
    ['estat', '', 'postestimation', 'estat subcommand [, options]', 'Postestimation statistics (ic, vce, summarize, hettest, ovtest, firststage, ...).'],
    ['estimates', 'est', 'postestimation', 'estimates {store|restore|table|stats|dir|drop|save|use|replay} [namelist] [, options]', 'Save and manipulate estimation results.'],
    ['hausman', '', 'postestimation', 'hausman name-consistent [name-efficient] [, sigmamore constant]', 'Hausman specification test.'],
    ['lrtest', '', 'postestimation', 'lrtest modelspec1 [modelspec2] [, stats force]', 'Likelihood-ratio test after estimation.'],
    ['suest', '', 'postestimation', 'suest namelist [, vce(vcetype)]', 'Seemingly unrelated estimation.'],
    ['linktest', '', 'postestimation', 'linktest [if] [in]', 'Specification link test for single-equation models.'],
    ['rvfplot', '', 'postestimation', 'rvfplot [, options]', 'Residual-versus-fitted plot.'],
    ['avplot', '', 'postestimation', 'avplot indepvar [, options]', 'Added-variable plot.'],

    ['bootstrap', '', 'prefix', 'bootstrap exp_list [, reps(#) seed(#) cluster(varlist)] : command', 'Bootstrap sampling and estimation.'],
    ['jackknife', '', 'prefix', 'jackknife exp_list [, cluster(varlist)] : command', 'Jackknife estimation.'],
    ['permute', '', 'prefix', 'permute permvar exp_list [, reps(#) seed(#)] : command', 'Monte Carlo permutation tests.'],
    ['simulate', '', 'prefix', 'simulate [exp_list], reps(#) [seed(#) saving(filename)] : command', 'Monte Carlo simulations.'],
    ['statsby', '', 'prefix', 'statsby [exp_list] [, by(varlist) clear saving(filename)] : command', 'Collect statistics for a command across a by list.'],
    ['rolling', '', 'prefix', 'rolling [exp_list] [if] [in], window(#) [recursive saving(filename)] : command', 'Rolling-window and recursive estimation.'],
    ['svy', '', 'prefix', 'svy [vcetype] [, svy_options] : command', 'Survey data analysis prefix.'],
    ['xi', '', 'prefix', 'xi [, prefix(string)] : command ... i.varname ...', 'Interaction expansion (largely superseded by factor variables).'],
    ['nestreg', '', 'prefix', 'nestreg [, lr waldtable] : command_name depvar (varlist) (varlist) ...', 'Nested model statistics.'],
    ['stepwise', '', 'prefix', 'stepwise [, pr(#) pe(#)] : command', 'Stepwise estimation.'],
    ['fvset', '', 'utility', 'fvset {base|design|clear|report} ...', 'Declare factor-variable settings.'],

    // ---- Graphics ----------------------------------------------------------
    ['graph', 'gr', 'graphics', 'graph {twoway|bar|box|pie|matrix|dot|combine|export|save|use|display|drop} ...', 'Draw, combine, and export graphs.'],
    ['twoway', 'tw', 'graphics', 'twoway (plottype varlist [if] [in] [, options]) (...) [, twoway_options]', 'Two-way graphs (scatter, line, area, bar, lfit, ...).'],
    ['scatter', 'sc', 'graphics', 'scatter varlist [if] [in] [weight] [, marker_options twoway_options]', 'Two-way scatterplot.'],
    ['line', '', 'graphics', 'line varlist [if] [in] [, connect_options twoway_options]', 'Two-way line plot.'],
    ['connected', '', 'graphics', 'twoway connected varlist [if] [in] [, options]', 'Two-way connected plot.'],
    ['lfit', '', 'graphics', 'twoway lfit yvar xvar [if] [in] [weight] [, options]', 'Two-way linear prediction plot.'],
    ['qfit', '', 'graphics', 'twoway qfit yvar xvar [if] [in] [weight] [, options]', 'Two-way quadratic prediction plot.'],
    ['kdensity', '', 'graphics', 'kdensity varname [if] [in] [weight] [, kernel(kernel) bwidth(#) normal]', 'Univariate kernel density estimation.'],
    ['lowess', '', 'graphics', 'lowess yvar xvar [if] [in] [, bwidth(#) generate(newvar)]', 'Lowess smoothing.'],
    ['tsline', '', 'graphics', 'tsline varlist [if] [in] [, tsline_options]', 'Time-series line plots.'],
    ['qnorm', '', 'graphics', 'qnorm varname [if] [in] [, grid]', 'Quantile-normal plot.'],
    ['pnorm', '', 'graphics', 'pnorm varname [if] [in] [, grid]', 'Standardized normal probability plot.'],
    ['binscatter', '', 'community', 'binscatter y_var x_var [if] [in] [weight] [, by(varname) nquantiles(#) controls(varlist) absorb(varname) linetype(lfit|qfit|connect|none)]', 'Binned scatterplots (SSC: `ssc install binscatter`).'],
    ['binsreg', '', 'community', 'binsreg depvar indvar [othercovs] [if] [in] [weight] [, by(varname) nbins(#) ci() cb()]', 'Data-driven binscatter estimation and inference (SSC).'],
    ['coefplot', '', 'community', 'coefplot [modellist] [, keep(coeflist) drop(coeflist) vertical xline(0) ci(spec)]', 'Plot regression coefficients (SSC: `ssc install coefplot`).'],
    ['grstyle', '', 'community', 'grstyle {init|set|clear} ...', 'Customize graph scheme settings on the fly (SSC).'],


    // ---- Community-contributed estimation & reporting ----------------------
    ['reghdfe', '', 'community', 'reghdfe depvar [indepvars] [if] [in] [weight], absorb(absvars) [vce(robust|cluster clustervars) residuals(newvar)]', 'Linear regression absorbing multiple levels of fixed effects (SSC: `ssc install reghdfe`).'],
    ['ivreghdfe', '', 'community', 'ivreghdfe depvar [varlist1] (varlist2 = instlist) [if] [in] [weight], absorb(absvars) [cluster(vars) first]', 'IV/2SLS/GMM with multiple fixed effects (ivreg2 + reghdfe).'],
    ['ppmlhdfe', '', 'community', 'ppmlhdfe depvar [indepvars] [if] [in] [weight], absorb(absvars) [exposure(varname) vce(cluster clustvar) d(newvar)]', 'Poisson pseudo-maximum likelihood with multiple fixed effects (SSC).'],
    ['ivreg2', '', 'community', 'ivreg2 depvar [varlist1] (varlist2 = varlist_iv) [if] [in] [weight] [, gmm2s liml robust cluster(varlist) first endog()]', 'Extended IV/2SLS, GMM and AC/HAC, LIML and k-class regression (SSC).'],
    ['xtivreg2', '', 'community', 'xtivreg2 depvar [varlist1] (varlist2 = varlist_iv) [if] [in] [weight], fe|fd [options]', 'Extended IV/GMM for panel-data models (SSC).'],
    ['xtabond2', '', 'community', 'xtabond2 depvar varlist [if] [in] [weight] [, gmmstyle(varlist) ivstyle(varlist) twostep robust]', 'Arellano-Bond/Blundell-Bond dynamic panel GMM (SSC).'],
    ['boottest', '', 'community', 'boottest [indeplist] [, reps(#) cluster(varlist) weighttype(rademacher|webb)]', 'Wild (cluster) bootstrap tests after estimation (SSC).'],
    ['csdid', '', 'community', 'csdid depvar [indepvars] [if] [in] [weight], ivar(varname) time(varname) gvar(varname) [notyet method()]', 'Callaway & Sant\'Anna (2021) difference-in-differences (SSC).'],
    ['did_multiplegt', '', 'community', 'did_multiplegt Y G T D [if] [in] [, robust_dynamic dynamic(#) placebo(#) breps(#) cluster(varname)]', 'de Chaisemartin & D\'Haultfoeuille DID estimators (SSC).'],
    ['did_imputation', '', 'community', 'did_imputation Y i t Ei [if] [in] [weight] [, horizons(numlist) pretrends(#) fe(list)]', 'Borusyak, Jaravel & Spiess imputation DID estimator (SSC).'],
    ['eventstudyinteract', '', 'community', 'eventstudyinteract y rel_time_list [if] [in] [weight], cohort(variable) control_cohort(variable) [absorb(varlist) vce(vcetype)]', 'Sun & Abraham interaction-weighted event-study estimator (SSC).'],
    ['jwdid', '', 'community', 'jwdid depvar [indepvars] [if] [in] [weight], ivar(varname) tvar(varname) gvar(varname)', 'Wooldridge extended two-way fixed-effects DID (SSC).'],
    ['rdrobust', '', 'community', 'rdrobust depvar runvar [if] [in] [, c(#) p(#) h(#) kernel(kernelfn) bwselect(bwmethod) vce(vcemethod)]', 'Robust regression-discontinuity estimation (SSC).'],
    ['rdplot', '', 'community', 'rdplot depvar runvar [if] [in] [, c(#) p(#) nbins(# #) binselect(binmethod)]', 'Data-driven regression-discontinuity plots (SSC).'],
    ['synth', '', 'community', 'synth depvar predictorvars, trunit(#) trperiod(#) [counit(numlist) fig]', 'Synthetic control method (SSC).'],
    ['psmatch2', '', 'community', 'psmatch2 depvar [indepvars] [if] [in], [outcome(varlist) neighbor(#) caliper(#) common]', 'Propensity score matching (SSC).'],
    ['winsor2', '', 'community', 'winsor2 varlist [if] [in] [, suffix(str) replace cuts(# #) trim by(groupvar)]', 'Winsorize or trim variables (SSC).'],
    ['esttab', '', 'community', 'esttab [namelist] [using filename] [, replace b(fmt) se star(* 0.10 ** 0.05 *** 0.01) keep() drop() label booktabs csv rtf tex]', 'Publication-quality regression tables (estout package, SSC).'],
    ['estout', '', 'community', 'estout [namelist] [using filename] [, cells(array) stats(scalarlist) style(style) replace]', 'Make tables from stored estimates (SSC).'],
    ['eststo', '', 'community', 'eststo [name] [, title(string) addscalars(...)] [: estimation_command]', 'Store estimates for use with esttab/estout (SSC).'],
    ['estadd', '', 'community', 'estadd subcommand [, options] [: namelist]', 'Add results to stored estimates (e.g. `estadd local FE "Yes"`).'],
    ['estpost', '', 'community', 'estpost {summarize|tabstat|ttest|tabulate|correlate} ...', 'Post results from non-estimation commands for esttab (SSC).'],
    ['outreg2', '', 'community', 'outreg2 [varlist] [estlist] using filename [, replace append excel word tex label keep() drop() ctitle()]', 'Arrange regression outputs into an illustrative table (SSC).'],
    ['asdoc', '', 'community', 'asdoc command [, save(filename) replace append title(text)]', 'Send Stata output to MS Word (SSC).'],
    ['gtools', '', 'community', 'gtools, {install|upgrade|replace}', 'Faster Stata for big data (gcollapse, gegen, gisid, glevelsof, ...) (SSC).'],
    ['gcollapse', '', 'community', 'gcollapse clist [if] [in] [weight] [, by(varlist) cw fast merge]', 'Fast collapse from gtools (SSC).'],
    ['gegen', '', 'community', 'gegen [type] newvar = fcn(arguments) [if] [in] [, by(varlist)]', 'Fast egen from gtools (SSC).'],
    ['fcollapse', '', 'community', 'fcollapse clist [if] [in] [weight] [, by(varlist) fast]', 'Fast collapse from ftools (SSC).'],
    ['ftools', '', 'community', 'ftools, compile', 'Fast data manipulation tools required by reghdfe (SSC).'],
    ['distinct', '', 'community', 'distinct [varlist] [if] [in] [, missing abbrev(#) joint]', 'Display number of distinct values of variables (SSC).'],
    ['unique', '', 'community', 'unique varlist [if] [in] [, by(varname) generate(newvar)]', 'Report number of unique values (SSC).'],
    ['fre', '', 'community', 'fre varlist [if] [in] [weight] [, all nomissing]', 'One-way frequency tables with values and labels (SSC).'],
    ['carryforward', '', 'community', 'carryforward varlist [if] [in], {generate(newvarlist)|replace}', 'Carry values forward to fill missings (SSC).'],

    // ---- Programming -------------------------------------------------------
    ['display', 'di', 'programming', 'display [display_directive [display_directive [...]]]', 'Display strings and values of scalar expressions.'],
    ['local', 'loc', 'programming', 'local lclname [=exp | :macro_fcn | "[`]text["\']"]', 'Define a local macro; reference it as `` `name\' ``.'],
    ['global', 'gl', 'programming', 'global mname [=exp | :macro_fcn | "[`]text["\']"]', 'Define a global macro; reference it as `$name`.'],
    ['macro', 'ma', 'programming', 'macro {dir|list|drop|shift} [...]', 'Macro definition and manipulation.'],
    ['scalar', 'sca', 'programming', 'scalar [define] scalar_name = exp', 'Define and manipulate scalars.'],
    ['matrix', 'mat', 'programming', 'matrix [define] matname = matrix_expression | matrix list matname', 'Matrix commands.'],
    ['tempvar', '', 'programming', 'tempvar lclname [lclname ...]', 'Assign names to temporary variables.'],
    ['tempname', '', 'programming', 'tempname lclname [lclname ...]', 'Assign names to temporary scalars and matrices.'],
    ['tempfile', '', 'programming', 'tempfile lclname [lclname ...]', 'Assign names to temporary files.'],
    ['foreach', '', 'programming', 'foreach lname {in|of listtype} list {\n    commands referring to `lname\'\n}', 'Loop over items.'],
    ['forvalues', 'forv', 'programming', 'forvalues lname = range {\n    commands referring to `lname\'\n}', 'Loop over consecutive values.'],
    ['while', '', 'programming', 'while exp {\n    stata_commands\n}', 'Looping while an expression is true.'],
    ['if', '', 'programming', 'if exp {\n    commands\n}\nelse {\n    commands\n}', 'Programming `if` command (evaluated once, not per observation).'],
    ['else', '', 'programming', 'else {\n    commands\n}', 'Alternative branch of an `if` block.'],
    ['continue', '', 'programming', 'continue [, break]', 'Break out of loops.'],
    ['program', 'pr', 'programming', 'program [define] pgmname [, nclass rclass eclass sclass byable(recall) properties() sortpreserve]\n    ...\nend', 'Define and manipulate programs.'],
    ['end', '', 'programming', 'end', 'Terminate a `program`, `mata`, `python`, or `input` block.'],
    ['syntax', '', 'programming', 'syntax [varlist] [if] [in] [using/] [weight] [, options]', 'Parse Stata syntax into local macros.'],
    ['args', '', 'programming', 'args macroname1 [macroname2 ...]', 'Assign positional arguments to local macros.'],
    ['gettoken', '', 'programming', 'gettoken emname1 [emname2] : emname3 [, parse("pchars") quotes match(lmacname)]', 'Obtain the next token from a macro.'],
    ['tokenize', '', 'programming', 'tokenize [[`]"][string]["[\']] [, parse("pchars")]', 'Divide a string into tokens stored in `1\', `2\', ...'],
    ['marksample', '', 'programming', 'marksample lmacname [, novarlist strok zeroweight noby]', 'Create a marker variable for the estimation sample.'],
    ['markout', '', 'programming', 'markout marker_var [varlist] [, strok sysmissok]', 'Set marker to 0 where variables are missing.'],
    ['confirm', 'conf', 'programming', 'confirm {existence|file|number|variable|new variable|...} ...', 'Argument verification.'],
    ['return', 'ret', 'programming', 'return {list|scalar|local|matrix|clear} ...', 'Return (or list) r-class results.'],
    ['ereturn', 'eret', 'programming', 'ereturn {list|post|scalar|local|matrix|clear} ...', 'Return (or list) e-class results.'],
    ['sreturn', 'sret', 'programming', 'sreturn {list|local|clear} ...', 'Return (or list) s-class results.'],
    ['exit', '', 'programming', 'exit [[=]exp] [, clear STATA]', 'Exit from a program or do-file, optionally with a return code.'],
    ['error', '', 'programming', 'error exp', 'Display a standard error message and exit with a return code.'],
    ['version', 'vers', 'programming', 'version # [, born(ddMONyyyy)] [: command]', 'Set Stata version interpretation.'],
    ['mata', '', 'programming', 'mata [:]\n    mata statements\nend', 'Enter the Mata matrix programming language.'],
    ['python', '', 'programming', 'python [:]\n    python statements\nend', 'Run embedded Python code (Stata 16+).'],
    ['timer', '', 'programming', 'timer {on|off|list|clear} [#]', 'Time sections of code.'],
    ['file', '', 'programming', 'file {open|write|read|close|seek} handle ...', 'Read and write text and binary files.'],
    ['include', '', 'programming', 'include filename', 'Include a do-file inline, sharing local macros.'],
    ['do', '', 'programming', 'do filename [arguments] [, nostop]', 'Execute commands from a file.'],
    ['run', '', 'programming', 'run filename [arguments] [, nostop]', 'Execute commands from a file silently.'],
    ['which', '', 'utility', 'which fname[.ftype] [, all]', 'Display location and version of an ado-file.'],
    ['findfile', '', 'utility', 'findfile filename [, path(path) nodescend all]', 'Find a file along the ado-path.'],
    ['adopath', '', 'utility', 'adopath [+|++|-] path_or_codeword', 'Manipulate the ado-file search path.'],
    ['creturn', '', 'programming', 'creturn list', 'List system constants and settings (`c()`).'],
    ['putexcel', '', 'reporting', 'putexcel set filename [, sheet(name) replace modify] | putexcel cell = exp', 'Export results and formatting to Excel.'],
    ['putdocx', '', 'reporting', 'putdocx {begin|paragraph|text|table|image|save} ...', 'Create Word (.docx) documents.'],
    ['putpdf', '', 'reporting', 'putpdf {begin|paragraph|text|table|image|save} ...', 'Create PDF documents.'],
    ['dyndoc', '', 'reporting', 'dyndoc srcfile [arguments] [, saving(targetfile) replace]', 'Convert dynamic Markdown document to HTML or Word.'],
    ['log', '', 'utility', 'log using filename [, append replace text smcl name(logname)] | log close [logname]', 'Echo copy of session to a file.'],
    ['cmdlog', '', 'utility', 'cmdlog using filename [, append replace]', 'Log commands only.'],
    ['sleep', '', 'utility', 'sleep #', 'Pause for a specified number of milliseconds.'],
    ['beep', '', 'utility', 'beep', 'Sound a bell.'],

    // ---- Prefixes ----------------------------------------------------------
    ['quietly', 'qui', 'prefix', 'quietly [:] command | quietly { ... }', 'Suppress output of a command or block.'],
    ['noisily', 'n', 'prefix', 'noisily [:] command', 'Display output (inside a `quietly` block).'],
    ['capture', 'cap', 'prefix', 'capture [:] command | capture { ... }', 'Run a command and suppress errors; return code in `_rc`.'],
    ['by', '', 'prefix', 'by varlist [, sort rc0] : stata_cmd', 'Repeat a command on subsets of the data.'],
    ['bysort', 'bys', 'prefix', 'bysort varlist [(varlist)] [, rc0] : stata_cmd', 'Sort and repeat a command on subsets of the data.'],
    ['frame', '', 'frames', 'frame {create|change|copy|rename|drop|put|dir|pwf} ... | frame framename: command', 'Manage data frames or run a command in another frame.'],
    ['frames', '', 'frames', 'frames {dir|reset|describe|save|use}', 'Data frames: list, reset, save, and use sets of frames.'],
    ['cwf', '', 'frames', 'cwf framename', 'Change the current (working) frame.'],
    ['pwf', '', 'frames', 'pwf', 'Display the name of the current frame.'],
    ['frlink', '', 'frames', 'frlink {1:1|m:1} varlist, frame(framename [varlist2]) [generate(linkvar)]', 'Link frames.'],
    ['frget', '', 'frames', 'frget varlist, from(linkvar) [prefix(str) suffix(str)]', 'Copy variables from a linked frame.'],
    ['fralias', '', 'frames', 'fralias add varlist, from(linkvar)', 'Create alias variables from a linked frame (Stata 18+).'],

    // ---- Files, system, packages -------------------------------------------
    ['cd', '', 'files', 'cd ["]directory_name["]', 'Change working directory.'],
    ['pwd', '', 'files', 'pwd', 'Display working directory.'],
    ['dir', '', 'files', 'dir ["][filespec]["] [, wide]', 'Display directory contents.'],
    ['ls', '', 'files', 'ls ["][filespec]["] [, wide]', 'Display directory contents.'],
    ['mkdir', '', 'files', 'mkdir directory_name [, public]', 'Create a directory.'],
    ['rmdir', '', 'files', 'rmdir directory_name', 'Remove an empty directory.'],
    ['erase', '', 'files', 'erase ["]filename["]', 'Erase a disk file.'],
    ['rm', '', 'files', 'rm ["]filename["]', 'Erase a disk file (Unix-style alias of `erase`).'],
    ['copy', '', 'files', 'copy filename1 filename2 [, public text replace]', 'Copy a file from disk or URL.'],
    ['type', '', 'files', 'type ["]filename["] [, asis smcl]', 'Display the contents of a file.'],
    ['shell', '', 'files', 'shell [operating_system_command]', 'Temporarily invoke the operating system.'],
    ['zipfile', '', 'files', 'zipfile file_list, saving(zipfilename [, replace])', 'Compress files to a zip archive.'],
    ['unzipfile', '', 'files', 'unzipfile zipfilename [, replace]', 'Extract files from a zip archive.'],
    ['ssc', '', 'utility', 'ssc {install|uninstall|describe|new|hot|type} pkgname [, replace all]', 'Install and uninstall packages from SSC.'],
    ['net', '', 'utility', 'net {install|from|describe|get|search} ...', 'Install and manage community-contributed additions from the Internet.'],
    ['ado', '', 'utility', 'ado {dir|describe|update|uninstall} ...', 'List, update, and uninstall installed packages.'],
    ['help', 'h', 'utility', 'help [command_or_topic_name] [, nonew name(viewername)]', 'Display help information.'],
    ['search', '', 'utility', 'search word [word ...] [, all local net sj faq]', 'Search Stata documentation and other resources.'],
    ['query', '', 'utility', 'query [output|interface|graphics|efficiency|network|update|trace|mata|other]', 'Display system parameters.'],
    ['about', '', 'utility', 'about', 'Display information about your version of Stata.'],
    ['update', '', 'utility', 'update [query|all] [, from(location)]', 'Check for and install official updates.'],
    ['window', 'win', 'utility', 'window {manage|menu|stopbox|...} ...', 'Programming menus and windows.'],
    ['discard', '', 'utility', 'discard', 'Drop automatically loaded programs.'],
    ['more', '', 'utility', 'more', 'Pause until a key is pressed.'],
    ['pause', '', 'utility', 'pause [on|off|message]', 'Program debugging command.'],

    ['numlist', '', 'programming', 'numlist "numlist" [, ascending integer min(#) max(#) sort]', 'Parse numeric lists into `r(numlist)`.'],
    ['mark', '', 'programming', 'mark newmarkvar [if] [in] [weight] [, zeroweight noby]', 'Create a marker variable.'],
    ['unab', '', 'programming', 'unab lmacname : [varlist] [, min(#) max(#) name(string)]', 'Unabbreviate variable list.'],
    ['fvexpand', '', 'programming', 'fvexpand [varlist] [if] [in]', 'Expand factor varlists into `r(varlist)`.'],

];

export const STATA_COMMANDS: StataCommand[] = COMMAND_ROWS.map(([name, abbrev, category, signature, doc]) => ({ name, minAbbrev: abbrev || name, category, signature, doc }));

const COMMAND_BY_NAME = new Map(STATA_COMMANDS.map(c => [c.name, c]));


/**
 * Resolve a (possibly abbreviated) Stata command to its table entry.
 * `su`, `sum`, `summ` -> summarize; `g`, `gen` -> generate; `reg` -> regress; unknown -> undefined.
 */
export function resolveCommand(word: string): StataCommand | undefined {
    const w = word.trim().toLowerCase();
    if (!w) {
        return undefined;
    }
    const exact = COMMAND_BY_NAME.get(w);
    if (exact) {
        return exact;
    }
    let best: StataCommand | undefined;
    for (const cmd of STATA_COMMANDS) {
        if (cmd.name.startsWith(w) && w.length >= cmd.minAbbrev.length && cmd.minAbbrev !== cmd.name) {
            // On overlap (e.g. `sca` fits both scatter/sc and scalar/sca) the longer, more specific abbreviation wins.
            if (!best || cmd.minAbbrev.length > best.minAbbrev.length) {
                best = cmd;
            }
        }
    }
    return best;
}

/** Abbreviations worth showing in completion details, e.g. "su" for summarize. */
export function abbreviationLabel(cmd: StataCommand): string | undefined {
    return cmd.minAbbrev !== cmd.name ? cmd.minAbbrev : undefined;
}

const PREFIX_WORDS = /^(?:qui|quie|quiet|quietl|quietly|n|no|noi|nois|noisi|noisil|noisily|cap|capt|captu|captur|capture)$/i;

/**
 * True when the text before the cursor on the current line (excluding the partial word being typed)
 * is a position where a Stata command name is expected: line start, after `quietly`/`capture`/`noisily`,
 * after a `prefix ... :` (by/bysort/frame/svy/bootstrap ...), or after an opening `{`.
 */
export function isCommandPosition(linePrefix: string): boolean {
    let text = linePrefix;
    // Everything up to the last prefix colon (by x: / frame f: / quietly:) is a prefix.
    const colon = text.lastIndexOf(':');
    if (colon >= 0) {
        text = text.slice(colon + 1);
    }
    const brace = text.lastIndexOf('{');
    if (brace >= 0) {
        text = text.slice(brace + 1);
    }
    const words = text.trim().split(/\s+/).filter(Boolean);
    return words.every(w => PREFIX_WORDS.test(w));
}

const FUNCTION_ROWS: [string, string, string][] = [
    // Math
    ['abs', 'abs(x)', 'Absolute value of x.'],
    ['ceil', 'ceil(x)', 'Smallest integer >= x.'],
    ['floor', 'floor(x)', 'Largest integer <= x.'],
    ['int', 'int(x)', 'Integer obtained by truncating x toward 0.'],
    ['round', 'round(x[, y])', 'x rounded to units of y (default 1).'],
    ['exp', 'exp(x)', 'Exponential e^x.'],
    ['ln', 'ln(x)', 'Natural logarithm.'],
    ['log', 'log(x)', 'Natural logarithm (synonym for ln).'],
    ['log10', 'log10(x)', 'Base-10 logarithm.'],
    ['sqrt', 'sqrt(x)', 'Square root.'],
    ['mod', 'mod(x, y)', 'Modulus of x with respect to y.'],
    ['max', 'max(x1, x2, ..., xn)', 'Maximum value, ignoring missing.'],
    ['min', 'min(x1, x2, ..., xn)', 'Minimum value, ignoring missing.'],
    ['sum', 'sum(x)', 'Running sum of x (missing treated as 0).'],
    ['sign', 'sign(x)', 'Sign of x: -1, 0, or 1.'],
    ['logit', 'logit(x)', 'Log of the odds ratio: ln(x/(1-x)).'],
    ['invlogit', 'invlogit(x)', 'Inverse logit: exp(x)/(1+exp(x)).'],
    ['comb', 'comb(n, k)', 'Combinatorial function n!/(k!(n-k)!).'],
    ['lnfactorial', 'lnfactorial(n)', 'Natural log of n factorial.'],
    // Statistical / random
    ['normal', 'normal(z)', 'Cumulative standard normal distribution.'],
    ['normalden', 'normalden(z[, mu, sigma])', 'Normal density.'],
    ['invnormal', 'invnormal(p)', 'Inverse cumulative standard normal.'],
    ['ttail', 'ttail(df, t)', 'Reverse cumulative Student\'s t distribution.'],
    ['invttail', 'invttail(df, p)', 'Inverse reverse cumulative Student\'s t.'],
    ['chi2tail', 'chi2tail(df, x)', 'Reverse cumulative chi-squared distribution.'],
    ['Ftail', 'Ftail(df1, df2, f)', 'Reverse cumulative F distribution.'],
    ['runiform', 'runiform([a, b])', 'Uniform random variates on (a, b); default (0, 1).'],
    ['runiformint', 'runiformint(a, b)', 'Uniform random integers in [a, b].'],
    ['rnormal', 'rnormal([m, s])', 'Normal random variates with mean m and s.d. s.'],
    ['rbinomial', 'rbinomial(n, p)', 'Binomial random variates.'],
    ['rpoisson', 'rpoisson(m)', 'Poisson random variates with mean m.'],
    // Programming
    ['cond', 'cond(x, a, b[, c])', 'a if x is true and nonmissing, b if false, c if x is missing.'],
    ['inlist', 'inlist(z, a, b, ...)', '1 if z equals any of the remaining arguments.'],
    ['inrange', 'inrange(z, a, b)', '1 if a <= z <= b.'],
    ['missing', 'missing(x1, x2, ..., xn)', '1 if any argument is missing.'],
    ['mi', 'mi(x1, x2, ..., xn)', 'Synonym for missing().'],
    ['autocode', 'autocode(x, n, x0, x1)', 'Partition (x0, x1] into n intervals and return the upper bound.'],
    ['recode', 'recode(x, x1, x2, ..., xn)', 'Return the first xi such that x <= xi.'],
    ['clip', 'clip(x, a, b)', 'x clipped to the range [a, b].'],
    ['float', 'float(x)', 'x rounded to float precision.'],

    ['byteorder', 'byteorder()', '1 if big-endian, 2 if little-endian.'],
    ['c', 'c(name)', 'Value of system constant/setting (e.g. c(N), c(pwd), c(current_date)).'],
    ['r', 'r(name)', 'Value of an r-class stored result.'],
    ['e', 'e(name)', 'Value of an e-class stored result.'],
    ['_b', '_b[coef]', 'Coefficient from the last estimation.'],
    ['_se', '_se[coef]', 'Standard error from the last estimation.'],
    // Strings
    ['strlen', 'strlen(s)', 'Number of characters (bytes) in s.'],
    ['ustrlen', 'ustrlen(s)', 'Number of Unicode characters in s.'],
    ['strtrim', 'strtrim(s)', 's without leading and trailing blanks.'],
    ['strltrim', 'strltrim(s)', 's without leading blanks.'],
    ['strrtrim', 'strrtrim(s)', 's without trailing blanks.'],
    ['stritrim', 'stritrim(s)', 's with multiple internal blanks collapsed to one.'],
    ['strupper', 'strupper(s)', 'Uppercase s.'],
    ['strlower', 'strlower(s)', 'Lowercase s.'],
    ['strproper', 'strproper(s)', 'Title-case s.'],
    ['substr', 'substr(s, n1, n2)', 'Substring of s starting at n1 for length n2.'],
    ['usubstr', 'usubstr(s, n1, n2)', 'Unicode substring of s starting at n1 for length n2.'],
    ['strpos', 'strpos(s1, s2)', 'Position of s2 in s1, or 0.'],
    ['strrpos', 'strrpos(s1, s2)', 'Position of the last occurrence of s2 in s1.'],
    ['subinstr', 'subinstr(s1, s2, s3, n)', 'Replace first n occurrences of s2 in s1 with s3 (n = . for all).'],
    ['subinword', 'subinword(s1, s2, s3, n)', 'Replace first n whole-word occurrences of s2 in s1 with s3.'],
    ['word', 'word(s, n)', 'The nth word of s.'],
    ['wordcount', 'wordcount(s)', 'Number of words in s.'],
    ['strofreal', 'strofreal(n[, s])', 'n converted to string using format s.'],
    ['string', 'string(n[, s])', 'Synonym for strofreal().'],
    ['real', 'real(s)', 's converted to numeric, or missing.'],
    ['strmatch', 'strmatch(s1, s2)', '1 if s1 matches the pattern s2 (* and ? wildcards).'],
    ['regexm', 'regexm(s, re)', '1 if regular expression re matches s.'],
    ['regexr', 'regexr(s1, re, s2)', 'Replace the first match of re in s1 with s2.'],
    ['regexs', 'regexs(n)', 'Subexpression n from a previous regexm() match.'],
    ['ustrregexm', 'ustrregexm(s, re[, noc])', 'Unicode regex match.'],
    ['ustrregexra', 'ustrregexra(s1, re, s2[, noc])', 'Replace all Unicode regex matches of re in s1 with s2.'],
    ['ustrregexs', 'ustrregexs(n)', 'Subexpression n from a previous ustrregexm() match.'],
    ['strreverse', 'strreverse(s)', 'Reverse of s.'],
    ['char', 'char(n)', 'Character corresponding to ASCII code n.'],
    ['uchar', 'uchar(n)', 'Unicode character for code point n.'],
    ['plural', 'plural(n, s[, s2])', 'Plural of s if n != 1.'],
    ['abbrev', 'abbrev(s, n)', 'Name s abbreviated to n characters.'],
    ['indexnot', 'indexnot(s1, s2)', 'Position of first character of s1 not found in s2.'],
    ['strtoname', 'strtoname(s[, p])', 's converted to a valid Stata name.'],
    ['fileexists', 'fileexists(f)', '1 if file f exists.'],
    // Date & time
    ['date', 'date(s, mask[, topyear])', 'Daily date (%td) from string s, e.g. date(s, "YMD").'],
    ['mdy', 'mdy(M, D, Y)', 'Daily date from month, day, and year.'],

    ['year', 'year(d)', 'Calendar year of daily date d.'],
    ['month', 'month(d)', 'Month (1-12) of daily date d.'],
    ['day', 'day(d)', 'Day of month of daily date d.'],
    ['dow', 'dow(d)', 'Day of week (0 = Sunday) of daily date d.'],
    ['doy', 'doy(d)', 'Day of year of daily date d.'],
    ['week', 'week(d)', 'Week of year of daily date d.'],
    ['quarter', 'quarter(d)', 'Quarter of daily date d.'],
    ['halfyear', 'halfyear(d)', 'Half-year of daily date d.'],
    ['ym', 'ym(Y, M)', 'Monthly date (%tm) from year and month.'],
    ['yq', 'yq(Y, Q)', 'Quarterly date (%tq) from year and quarter.'],
    ['yw', 'yw(Y, W)', 'Weekly date (%tw) from year and week.'],
    ['mofd', 'mofd(d)', 'Monthly date from daily date.'],
    ['qofd', 'qofd(d)', 'Quarterly date from daily date.'],
    ['dofm', 'dofm(m)', 'Daily date of the first day of monthly date m.'],
    ['dofq', 'dofq(q)', 'Daily date of the first day of quarterly date q.'],
    ['dofc', 'dofc(c)', 'Daily date from datetime c (%tc).'],
    ['clock', 'clock(s, mask[, topyear])', 'Datetime (%tc) from string s, e.g. clock(s, "YMDhms").'],
    ['monthly', 'monthly(s, mask[, topyear])', 'Monthly date from string s.'],
    ['quarterly', 'quarterly(s, mask[, topyear])', 'Quarterly date from string s.'],

];

export const STATA_FUNCTIONS: StataFunction[] = FUNCTION_ROWS.map(([name, signature, doc]) => ({ name, signature, doc }));

const FUNCTION_BY_NAME = new Map(STATA_FUNCTIONS.map(f => [f.name, f]));

export function resolveFunction(name: string): StataFunction | undefined {
    return FUNCTION_BY_NAME.get(name);
}

export interface StataSnippet {
    label: string;
    description: string;
    /** VS Code snippet syntax. */
    body: string;
}

export const STATA_SNIPPETS: StataSnippet[] = [
    { label: 'foreach', description: 'foreach loop', body: 'foreach ${1:v} ${2|of varlist,in,of local,of global,of numlist|} ${3:list} {\n\t$0\n}' },
    { label: 'forvalues', description: 'forvalues loop', body: 'forvalues ${1:i} = ${2:1}/${3:10} {\n\t$0\n}' },
    { label: 'while', description: 'while loop', body: 'while ${1:condition} {\n\t$0\n}' },
    { label: 'if', description: 'if block', body: 'if ${1:condition} {\n\t$0\n}' },
    { label: 'ifelse', description: 'if / else block', body: 'if ${1:condition} {\n\t$2\n}\nelse {\n\t$0\n}' },
    {
        label: 'program',
        description: 'program define ... end',
        body: 'capture program drop ${1:name}\nprogram define ${1:name}, ${2|rclass,eclass,sclass,nclass|}\n\tversion ${3:18}\n\tsyntax ${4:varlist} [if] [in] [, ${5:options}]\n\tmarksample touse\n\t$0\nend'
    },
    { label: 'preserve', description: 'preserve ... restore', body: 'preserve\n\t$0\nrestore' },
    { label: 'capture noisily', description: 'capture noisily block with error handling', body: 'capture noisily {\n\t$1\n}\nif _rc {\n\tdi as error "Failed with error " _rc\n\t${0:exit _rc}\n}' },
    { label: 'quietly', description: 'quietly block', body: 'quietly {\n\t$0\n}' },
    { label: 'mata', description: 'mata ... end block', body: 'mata:\n$0\nend' },
    { label: 'python', description: 'python ... end block', body: 'python:\n$0\nend' },
    { label: 'section', description: 'Section heading (Stata 18+ bookmark)', body: '**# ${1:Section title}\n$0' },
    { label: 'cell', description: 'Code cell marker', body: '* %% ${1:Cell title}\n$0' },
    {
        label: 'eststo-esttab',
        description: 'Store regressions and export a table',
        body: 'eststo clear\neststo: ${1:reghdfe y x}, absorb(${2:id year}) vce(cluster ${3:id})\nesttab using "${4:table.tex}", replace se star(* 0.10 ** 0.05 *** 0.01) label booktabs$0'
    },
];
