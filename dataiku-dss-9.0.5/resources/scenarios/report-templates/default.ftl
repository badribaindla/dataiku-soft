<!-- html:true -->
<#function computeEnd end>
  <#if end = 0>
    <#return .now?long>
  <#else>
    <#return end>
  </#if>
</#function>
<#function computeDuration start end>
  <#return computeEnd(end) - start>
</#function>

<html lang="en"><head></head><body leftmargin="0" topmargin="0" style="margin:0; padding:0; -webkit-text-size-adjust:none; -ms-text-size-adjust:none;" bgcolor="#f4f4f4" marginheight="0" marginwidth="0">
  <meta charset="utf-8"> <!-- utf-8 works for most cases -->
  <meta name="viewport" content="width=device-width"> <!-- Forcing initial-scale shouldn't be necessary -->
  <meta http-equiv="X-UA-Compatible" content="IE=edge"> <!-- Use the latest (edge) version of IE rendering engine -->
  <title>DSS scenario report</title> <!-- the <title> tag shows on email notifications on Android 4.4. -->
  <style type="text/css">

    /* ensure that clients don't add any padding or spaces around the email design and allow us to style emails for the entire width of the preview pane */
    body,
    #bodyTable {
      height:100% !important;
      width:100% !important;
      margin:0;
      padding:0;
    }

    /* Ensures Webkit- and Windows-based clients don't automatically resize the email text. */
    body,
    table,
    td,
    p,
    a,
    li,
    blockquote {
      -ms-text-size-adjust:100%;
      -webkit-text-size-adjust:100%;
    }

    /* Forces Yahoo! to display emails at full width */
    .thread-item.expanded .thread-body .body,
    .msg-body {
      width: 100% !important;
      display: block !important;
    }

    /* Forces Hotmail to display emails at full width */
    .ReadMsgBody,
    .ExternalClass {
      width: 100%;
      background-color: #f4f4f4;
    }

    /* Forces Hotmail to display normal line spacing. */
    .ExternalClass,
    .ExternalClass p,
    .ExternalClass span,
    .ExternalClass font,
    .ExternalClass td,
    .ExternalClass div {
      line-height:100%;
    }

    /* Resolves webkit padding issue. */
    table {
      border-spacing:0;
    }

    /* Resolves the Outlook 2007, 2010, and Gmail td padding issue, and removes spacing around tables that Outlook adds. */
    table,
    td {
      border-collapse:collapse;
      mso-table-lspace:0pt;
      mso-table-rspace:0pt;
    }

    /* Corrects the way Internet Explorer renders resized images in emails. */
    img {
      -ms-interpolation-mode: bicubic;
    }

    /* Ensures images don't have borders or text-decorations applied to them by default. */
    img,
    a img {
      border:0;
      outline:none;
      text-decoration:none;
    }

    /* Styles Yahoo's auto-sensing link color and border */
    .yshortcuts a {
      border-bottom: none !important;
    }

    /* Apple Mail doesn't support max-width, so we use media queries to constrain the email container width. */
    @media only screen and (min-width: 801px) {
      .email-container {
        width: 800px !important;
      }
    }
  </style>


<table id="bodyTable" style="border-collapse: collapse;table-layout: fixed;margin:0 auto;" width="100%" bgcolor="#f4f4f4" border="0" cellpadding="0" cellspacing="0" height="100%"><tbody><tr><td>

  <!-- Outlook and Lotus Notes don't support max-width but are always on desktop, so we can enforce a wide, fixed width view. -->
  <!-- Beginning of Outlook-specific wrapper : BEGIN -->
  <!--[if (gte mso 9)|(IE)]>
  <table width="800" align="center" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td>
  <![endif]-->
  <!-- Beginning of Outlook-specific wrapper : END -->

  <!-- Email wrapper : BEGIN -->
  <table style="max-width: 800px;margin: auto;" class="email-container" width="100%" border="0" cellpadding="0" cellspacing="0" align="center">
    <tbody><tr>
      <td>

        <!-- Logo Left, Nav Right : BEGIN -->
        <table width="100%" border="0" cellpadding="0" cellspacing="0">
          <tbody><tr>
            <td style="font-size: 0; line-height: 0;" height="20">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding-left: 30px;text-align: left; font-family: 'Source Sans Pro', Helvetica, arial, sans-serif; font-size: 18px; color: #555555;" valign="middle">
              The scenario <b>${scenarioName!scenarioId}</b> in project <b>${projectKey}</b>
<#switch outcome>
<#case 'SUCCESS'><span style="color: #468847">ran successfully</span><#break>
<#case 'WARNING'><span style="color: #c09853">ran with warnings</span><#break>
<#case 'FAILED'><span style="color: #b94a48">failed</span><#break>
<#case 'ABORTED'><span style="color: #b94a48">was aborted</span><#break>
<#default><span style="color: #b94a48">terminated unexpectedly</span>
</#switch>
 			   <#if scenarioRunURL??>
 			   		<a href="${scenarioRunURL}">(link)</a>
 			   </#if>
            </td>
            <td style="padding-right: 40px;text-align: right;" valign="middle">
              <a href="https://www.dataiku.com" target="_blank" style="font-size: 20px; color: #2BB2AD; font-family: 'Source Sans Pro', Helvetica, arial, sans-serif; text-decoration: none;">
                <img src="https://dku-assets.s3.amazonaws.com/img/emailing/logo.png" alt="Dataiku" width="180" border="0" height="64">
              </a>
            </td>
          </tr>
          <tr>
            <td style="font-size: 0; line-height: 0;" height="10">&nbsp;</td>
          </tr>
        </tbody></table>
        <!-- Logo Left, Nav Right : END -->

        <table width="100%" bgcolor="#ffffff" border="0" cellpadding="0" cellspacing="0">

          <!-- Full Width, Fluid Column : BEGIN -->
          <tbody ><tr>
            <td style="padding: 40px; font-family: 'Source Sans Pro', Helvetica, arial, sans-serif; font-size: 16px; line-height: 27px; color: #666666;">
	            <#assign runDuration=computeDuration(_rawScenarioRun.start, _rawScenarioRun.end)>
            	Started: ${_rawScenarioRun.start?number_to_datetime} <br />
              Completed: ${computeEnd(_rawScenarioRun.end)?number_to_datetime}<br />
              Duration: <#if runDuration < 120000 >${(runDuration/1000)?ceiling}s<#elseif runDuration < 3600000 >${(runDuration/60000)?floor}m ${((runDuration/1000) % 60)?ceiling}s<#else>${(runDuration/3600000)?floor}h ${((runDuration/60000)%60)?floor}m ${((runDuration/1000) % 60)?ceiling}s</#if>
            	<br/>
            	<#if _rawScenarioRun.trigger??>
	            	<#if _rawScenarioRun.trigger.trigger.type == 'manual'>
	            		Started manually
	            	<#else>
	            		Started by the trigger <em>${_rawScenarioRun.trigger.trigger.name!'of type ' + _rawScenarioRun.trigger.trigger.type}</em>
	            	</#if>
            	<br/>
            	</#if>
              <hr>
				<b>${_fullStepRuns?size}</b> steps were executed
				<table style="margin-top: 20px; width: 100%;">
        <tr><th>Step id</th><th>Duration</th><th>Outcome</th></tr>
				<#list _fullStepRuns as stepRun>
				    <#assign stepOutcome=(stepRun.result.outcome)!'NONE' >
				    <#assign stepDuration=computeDuration(stepRun.start, stepRun.end)>
					<tr style='background-color: ${((stepRun_index % 2)==0)?string("none", "#F9F9F9")}'>
            <td style="vertical-align: top;">
						${stepRun.step.name!stepRun.step.id}
            </td>
            <td style="vertical-align: top; text-align: right; padding-right: 8px"><#if stepDuration < 60000 >${(stepDuration/1000)?ceiling}s<#elseif stepDuration < 3600000 >${(stepDuration/60000)?floor}m ${((stepDuration/1000) % 60)?ceiling}s<#else>${(stepDuration/3600000)?floor}h ${((stepDuration/60000)%60)?floor}m ${((stepDuration/1000) % 60)?ceiling}s</#if>
            </td>
						<td style="vertical-align: top;">
						<#switch stepOutcome>
						<#case 'SUCCESS'><span style="color: #468847">SUCCESS</span><#break>
						<#case 'WARNING'><span style="color: #c09853">WARNING</span><#break>
						<#case 'FAILED'><span style="color: #b94a48">FAILED</span><#break>
						<#case 'ABORTED'><span style="color: #b94a48">ABORTED</span><#break>
						<#default>
						</#switch>
						<#if stepOutcome == "FAILED">
                            <#assign errorBearer=getBearerOfError(stepRun)!>
                            <#assign logBearer=getBearerOfLog(stepRun)!>
                            <#if (errorBearer.thrown)?? && (errorBearer.thrown.message)??>
							<br/>
							<span style='font-size: 12px; color: red; font-family: "Source Sans Pro",Helvetica,arial,sans-serif; line-height: 16px;'>${errorBearer.thrown.message}</span>
							</#if>
							<#if (logBearer.logTail)??>
							<br/>
							<pre style='font-size: 12px; color: red; font-family: "Source Sans Pro",Helvetica,arial,sans-serif; line-height: 16px; max-height: 300px; overflow: auto;'>
							<#list logBearer.logTail.lines as line>
${line}
							</#list>
							</pre>
							</#if>
						</#if>
            </td>
					</tr>
				</#list>
				</table>
        <hr>
        <#if scenarioRunURL??> More details <a href="${scenarioRunURL}">on the run report page</a>
        <#else>To get a link to the run report page, ask your DSS administrator to configure the DSS URL</#if>
            </td>
          </tr>
          <!-- Full Width, Fluid Column : END -->

        </tbody></table>
      </td>
    </tr>

    <!-- Footer : BEGIN -->
    <tr>
      <td style="text-align: center;padding: 40px 0;font-family: 'Source Sans Pro', Helvetica, arial, sans-serif; font-size: 12px; line-height: 18px;color: #888888;">
        Powered by
        <a href="https://www.dataiku.com/dss" target="_blank" style="color: #888888; padding: 0;text-decoration: underline">Dataiku DSS</a><br><br>
      </td>
    </tr>
    <!-- Footer : END -->

  </tbody></table>
  <!-- Email wrapper : END -->

  <!-- End of Outlook-specific wrapper : BEGIN -->
  <!--[if (gte mso 9)|(IE)]>
      </td>
    </tr>
  </table>
  <![endif]-->
  <!-- End of Outlook-specific wrapper : END -->

</td></tr></tbody></table>

</body></html>
