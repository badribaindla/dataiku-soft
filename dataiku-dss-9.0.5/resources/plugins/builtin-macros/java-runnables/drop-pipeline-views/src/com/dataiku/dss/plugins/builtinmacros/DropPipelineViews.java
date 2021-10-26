package com.dataiku.dss.plugins.builtinmacros;

import com.dataiku.dip.connections.AbstractSQLConnection;
import com.dataiku.dip.connections.ConnectionsDAO;
import com.dataiku.dip.connections.DSSConnection;
import com.dataiku.dip.connections.SQLConnectionProvider;
import com.dataiku.dip.coremodel.InfoMessage.GenericCodes;
import com.dataiku.dip.exceptions.CodedSQLException;
import com.dataiku.dip.plugin.BackendClient;
import com.dataiku.dip.plugin.CustomRunnable;
import com.dataiku.dip.plugin.ProgressTracker;
import com.dataiku.dip.plugin.ResultTableDTO;
import com.dataiku.dip.plugin.ResultTableDTO.ResultTableColumnDTO;
import com.dataiku.dip.security.AuthCtx;
import com.dataiku.dip.server.SpringUtils;
import com.dataiku.dip.sql.SQLDialect;
import com.dataiku.dip.utils.DKULogger;
import com.dataiku.dip.utils.JSON;
import com.google.gson.JsonObject;
import org.springframework.beans.factory.annotation.Autowired;

import java.nio.charset.StandardCharsets;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class DropPipelineViews implements CustomRunnable {
    private AuthCtx authCtx;
    private String projectKey;
    private String connectionName;
    private String schema;
    private boolean performDeletion;

    @Autowired private ConnectionsDAO connectionsDAO;

    @Override
    public void init(String projectKey,
                     JsonObject config,
                     JsonObject pluginConfig,
                     ProgressTracker progressTracker,
                     BackendClient backendClient) {
        this.authCtx = (AuthCtx) backendClient.getAuthCtx();
        this.projectKey = projectKey;
        this.connectionName = config.get("connection").getAsString();
        if (config.has("schema")) {
            this.schema = config.get("schema").getAsString();
        }
        this.performDeletion = config.get("performDeletion").getAsBoolean();
        SpringUtils.getInstance().autowire(this);
    }

    @Override
    public byte[] run() throws Exception {
        DSSConnection connection = connectionsDAO.getConnection(authCtx, connectionName);
        if (connection == null) {
            throw new IllegalArgumentException("Unable to find connection named '" + connectionName + "'");
        }

        if (!connection.isProperSQL()) {
            throw new IllegalArgumentException("Connection '" + connectionName + "' is not a SQL connection");
        }

        SQLDialect dialect = ((AbstractSQLConnection) connection).getDialect();

        List<ResultTableColumnDTO> resultTableDTOColumns = Arrays.asList(
                new ResultTableColumnDTO("Schema", "STRING"),
                new ResultTableColumnDTO("View name", "STRING"),
                new ResultTableColumnDTO("Deleted", "STRING")
        );

        List<List<String>> resultTableDTOData = new ArrayList<>();
        try (SQLConnectionProvider.SQLConnectionWrapper connectionWrapper =
                     SQLConnectionProvider.newConnection(connectionName, authCtx, projectKey)) {
            List<View> views = new ArrayList<>();
            String leftoverPipelineQuery = dialect.getLeftoverPipelineViewsQuery(schema);
            logger.infoV("Executing statement to get views: %s", leftoverPipelineQuery);
            try (Statement statement = connectionWrapper.createStatement()) {
                ResultSet resultSet = statement.executeQuery(leftoverPipelineQuery);
                while (resultSet.next()) {
                    String schemaName = resultSet.getString(1);
                    String viewName = resultSet.getString(2);
                    String catalogName = null;
                    if (resultSet.getMetaData().getColumnCount() > 2) {
                        catalogName = resultSet.getString(3);
                    }
                    views.add(new View(catalogName, schemaName, viewName));
                }
            }

            if (dialect.supportsCommitAndRollback()) {
                connectionWrapper.commit();
            }

            if (performDeletion) {
                // Since no effort is made to determine the dependencies between views, dropping a view will fail if
                // another view depends on it. So just keep looping until all are dropped. If a loop completes without
                // any views being dropped, then something bad is happening.
                List<View> viewsToDelete = new ArrayList<>(views);
                while (viewsToDelete.size() > 0) {
                    List<View> viewsToRetry = new ArrayList<>();
                    SQLException lastException = null;
                    for (View view : viewsToDelete) {
                        String dropViewSql = dialect.getDropViewInstruction(view.catalog, view.schema, view.name);
                        logger.infoV("Executing statement to drop a view: %s", dropViewSql);
                        try (Statement statement = connectionWrapper.createStatement()) {
                            statement.execute(dropViewSql);
                            if (dialect.supportsCommitAndRollback()) {
                                connectionWrapper.commit();
                            }
                            resultTableDTOData.add(Arrays.asList(view.schema, view.name, "Yes"));
                        } catch (SQLException e) {
                            lastException = e;
                            logger.warnV(e, "Failed to drop view %s.%s", view.schema, view.name);
                            viewsToRetry.add(view);
                            if (dialect.supportsCommitAndRollback()) {
                                connectionWrapper.rollback();
                            }
                        }
                    }
                    if (viewsToDelete.size() == viewsToRetry.size()) {
                        throw new CodedSQLException(GenericCodes.ERR_UNKNOWN, "Unable to drop all views",
                                lastException);
                    }
                    viewsToDelete = viewsToRetry;
                }
            } else {
                for (View view : views) {
                    resultTableDTOData.add(Arrays.asList(view.schema, view.name, "No"));
                }
            }
        }

        return JSON.json(new ResultTableDTO("Leftover Views", resultTableDTOColumns, resultTableDTOData))
                .getBytes(StandardCharsets.UTF_8);
    }

    @Override
    public void abort() {
        // Cannot be aborted.
    }

    private static class View {
        final String catalog;
        final String schema;
        final String name;

        View(String catalog, String schema, String  name) {
            this.catalog = catalog;
            this.schema = schema;
            this.name = name;
        }
    }

    private static DKULogger logger = DKULogger.getLogger("dku.macro.clearpipelineviews");
}
