<!-- html:true -->
<html lang="en"><head></head>
<body leftmargin="0" topmargin="0" style="margin:0; padding:0; -webkit-text-size-adjust:none; -ms-text-size-adjust:none;" bgcolor="#f4f4f4" marginheight="0" marginwidth="0">
  <meta charset="utf-8"> <!-- utf-8 works for most cases -->
  <meta name="viewport" content="width=device-width"> <!-- Forcing initial-scale shouldn't be necessary -->
  <meta http-equiv="X-UA-Compatible" content="IE=edge"> <!-- Use the latest (edge) version of IE rendering engine -->
  <title>DSS activity</title> <!-- the <title> tag shows on email notifications on Android 4.4. -->
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




  <table bgcolor="#F4F4F4" border="0" cellpadding="0" cellspacing="0" id="bodyTable" style="border-collapse: collapse;table-layout: fixed;margin:0 auto;" width="100%">
    <tbody>
      <tr>
        <td>
        <!-- Outlook and Lotus Notes don't support max-width but are always on desktop, so we can enforce a wide, fixed width view. -->
        <!-- Beginning of Outlook-specific wrapper : BEGIN -->
        <!--[if (gte mso 9)|(IE)]>
        <table width="800" align="center" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td>
              <![endif]-->
              <!-- Beginning of Outlook-specific wrapper : END -->
              <!-- Email wrapper : BEGIN -->
              <table align="center" border="0" cellpadding="0" cellspacing="0" class="email-container" style="max-width: 800px;margin: auto;" width="100%">
                <tbody>
                  <tr>
                    <td>
                      <!-- Logo Left, Nav Right : BEGIN -->
                      <table border="0" cellpadding="0" cellspacing="0" width="100%">
                        <tbody>
                          <tr>
                            <td height="20" style="font-size: 0; line-height: 0;">&nbsp;</td>
                          </tr>
                          <tr>
                            <td style="padding-left: 30px;text-align: left; font-family: 'Source Sans Pro', Helvetica, arial, sans-serif; font-size: 18px; color: #555555;" valign="middle">
                              ${title}
                            </td>
                            <td style="padding-right: 40px;text-align: right;" valign="middle">
                              <a href="https://www.dataiku.com" target="_blank" style="font-size: 20px; color: #2BB2AD; font-family: 'Source Sans Pro', Helvetica, arial, sans-serif; text-decoration: none;">
                                <img src="https://dku-assets.s3.amazonaws.com/img/emailing/logo.png" alt="Dataiku" width="180" border="0" height="64">
                              </a>
                            </td>
                          </tr>

                          <tr>
                            <td colspan="2" style="padding: 40px; font-family: 'Source Sans Pro', Helvetica, arial, sans-serif; font-size: 14px; line-height: 27px; color: #666666;background-color: #FFFFFF">

                              <div class="hi">
                                Hi ${username},
                              </div>

                              <div class="intro">
                                ${intro}
                              </div>

                              <div class="instance-details">
                                Dataiku DSS instance: <strong>${dssInstanceName!}</strong>
                                  <#if studioExternalUrl??>
                                      <#if dssInstanceName??> (<a href="${studioExternalUrl}">${studioExternalUrl}</a>)
                                      <#else> <a href="${studioExternalUrl}">${studioExternalUrl} </a>
                                      </#if>
                                  </#if>
                              </div>

                              <hr style="margin: 10px 0" />

                              <#list items.byProject as projectData>
                                  <strong>Project </strong> <span>${projectData.projectName}</span>
                                  <ul>
                                  <#list projectData.timelineItems as timelineItem>
                                    <li> ${timelineItem} </li>
                                  </#list>
                                  <#list projectData.mentions as mention>
                                    <li> ${mention} </li>
                                  </#list>
                                  <#list projectData.jobs as job>
                                    <li> ${job} </li>
                                  </#list>
                                  <#list projectData.mlTasks as mlTask>
                                    <li> ${mlTask} </li>
                                  </#list>
                                  <#list projectData.exports as export>
                                    <li> ${export} </li>
                                  </#list>
                                  </ul>
                              </#list>
                            </td>
                          </tr>
                        </tbody>
                      </table>
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
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

    </body></html>
