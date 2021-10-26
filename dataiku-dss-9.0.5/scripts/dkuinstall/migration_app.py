import migration_base
import migration_json

# Applicative-aware migration operations

class ShakerStepMigrationOperation(migration_base.ProjectLocalMigrationOperation):
    """Applies a migration operation that applies to a single type of Shaker step.
    It is applied in all places where a shaker script is referenced:
    * analysis script
    * prepare recipe
    * saved model versions
    """

    def __init__(self, step_type = None):
        self.step_type = step_type

    def __repr__(self):
        if self.step_type is None:
            raise NotImplementedError()
        return "Update preparation script " + self.step_type + " steps"

    def transform_step(self, step):
        raise NotImplementedError()

    def _transform_steps(self, root):
        res = []
        for step in root.get("steps", []):
            if step.get("metaType", "") == "GROUP":
                res.append(self._transform_steps(step))
            elif self.step_type is None or step.get("type", "") == self.step_type:
                res.append(self.transform_step(step))
            else:
                res.append(step)
        root["steps"] = res
        return root

    class InAnalysisScript(migration_json.ProjectConfigJsonMigrationOperation):
        def __init__(self, outer):
            self.outer = outer
        def file_patterns(self,):
            return ["analysis/*/core_params.json"]
        def jsonpath(self,):
            return "script"
        def transform(self, root, filepath):
            return self.outer._transform_steps(root)

    class InPrepareRecipe(migration_json.ProjectConfigJsonMigrationOperation):
        def __init__(self, outer):
            self.outer = outer
        def file_patterns(self,):
            return ["recipes/*.shaker"]
        def jsonpath(self,):
            return ""
        def transform(self, root, filepath):
            return self.outer._transform_steps(root)

    class InSavedModels(migration_json.EmbeddableJsonMigrationOperation):
        def __init__(self, outer):
            self.outer = outer
        def file_patterns(self,):
            return ["*/versions/*/script.json"]
        def jsonpath(self,):
            return ""
        def transform(self, root, filepath):
            return self.outer._transform_steps(root)

    class InSessions(migration_json.EmbeddableJsonMigrationOperation):
        def __init__(self, outer):
            self.outer = outer
        def file_patterns(self,):
            return ["*/*/sessions/*/script.json"]
        def jsonpath(self,):
            return ""
        def transform(self, root, filepath):
            return self.outer._transform_steps(root)

    class InPredictionTraining(migration_json.ProjectConfigJsonMigrationOperation):
        def __init__(self, outer):
            self.outer = outer
        def file_patterns(self,):
            return ["recipes/*.prediction_training"]
        def jsonpath(self,):
            return "script"
        def transform(self, root, filepath):
            return self.outer._transform_steps(root)

    class InClusteringCluster(migration_json.ProjectConfigJsonMigrationOperation):
        def __init__(self, outer):
            self.outer = outer
        def file_patterns(self,):
            return ["recipes/*.clustering_cluster"]
        def jsonpath(self,):
            return "script"
        def transform(self, root, filepath):
            return self.outer._transform_steps(root)

    class InClusteringTraining(migration_json.ProjectConfigJsonMigrationOperation):
        def __init__(self, outer):
            self.outer = outer
        def file_patterns(self,):
            return ["recipes/*.clustering_training"]
        def jsonpath(self,):
            return "script"
        def transform(self, root, filepath):
            return self.outer._transform_steps(root)

    def execute(self, project_paths):
        # The first two ones are simple because they use project-config
        self.InAnalysisScript(self).execute(project_paths)
        self.InPrepareRecipe(self).execute(project_paths)
        self.InSavedModels(self).execute(project_paths.saved_models)
        self.InPredictionTraining(self).execute(project_paths)
        self.InSessions(self).execute(project_paths.analysis_data)
        self.InClusteringCluster(self).execute(project_paths)
        self.InClusteringTraining(self).execute(project_paths)



class ShakerScriptMigrationOperation(migration_base.ProjectLocalMigrationOperation):
    """Applies a migration operation that applies to a SerializedShakerScript.
    It is applied in all places where a shaker script is referenced:
    * analysis script
    * prepare recipe
    * saved model versions
    """

    def __init__(self):
        pass

    def __repr__(self):
        return "Update preparation scripts: %s" % self.__class__.__name__

    class InExplore(migration_json.ProjectConfigJsonMigrationOperation):
        def __init__(self, outer):
            self.outer = outer
        def file_patterns(self,):
            return ["explore/*.json"]
        def jsonpath(self,):
            return ""
        def transform(self, root, filepath):
            return self.outer.transform_script(root)

    class InAnalysisScript(migration_json.ProjectConfigJsonMigrationOperation):
        def __init__(self, outer):
            self.outer = outer
        def file_patterns(self,):
            return ["analysis/*/core_params.json"]
        def jsonpath(self,):
            return "script"
        def transform(self, root, filepath):
            return self.outer.transform_script(root)

    class InPrepareRecipe(migration_json.ProjectConfigJsonMigrationOperation):
        def __init__(self, outer):
            self.outer = outer
        def file_patterns(self,):
            return ["recipes/*.shaker"]
        def jsonpath(self,):
            return ""
        def transform(self, root, filepath):
            return self.outer.transform_script(root)

    class InSavedModels(migration_json.EmbeddableJsonMigrationOperation):
        def __init__(self, outer):
            self.outer = outer
        def file_patterns(self,):
            return ["*/versions/*/script.json"]
        def jsonpath(self,):
            return ""
        def transform(self, root, filepath):
            return self.outer.transform_script(root)

    def execute(self, project_paths):
        # The first two ones are simple because they use project-config
        self.InExplore(self).execute(project_paths)
        self.InAnalysisScript(self).execute(project_paths)
        self.InPrepareRecipe(self).execute(project_paths)
        self.InSavedModels(self).execute(project_paths.saved_models)
