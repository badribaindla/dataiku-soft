from dataiku.doctor.distributed.cheap_future import CheapFuture
from dataiku.doctor.distributed.cheap_future import reraise_most_important
from dataiku.doctor.distributed.work_scheduler import SchedulerHardInterrupted
from dataiku.doctor.distributed.work_scheduler import SchedulerSoftInterrupted


class AbstractSearchStrategy(object):
    def explore(self, evaluator):
        """
        Explore the hyper parameter space and return the best result + the explored parameters
        """
        raise NotImplementedError

    def get_experiments_count(self):
        """
        Returns the max. nb of experiments or None if unbounded
        """
        raise NotImplementedError

    def get_default_parameters(self):
        """
        Return the first parameter explored when explore() is called
        """

        parameters = []

        def evaluator(parameter):
            parameters.append(parameter)
            return CheapFuture.from_exception(SchedulerSoftInterrupted)

        self.explore(evaluator)
        if len(parameters) == 0:
            raise Exception("Search strategy did not explore anything")
        return parameters[0]

    @staticmethod
    def explore_batch(evaluator, parameters):
        future_results = []
        interrupted_while_scheduling = False

        try:
            for parameter in parameters:
                # Blocking (if not enough workers)
                future_results.append(evaluator(parameter))

                # If some results have already failed, it's pointless to try to evaluate more points because we want to
                # stop everything as soon as possible. The following check is non blocking and only look at already
                # finished futures. This is an optimization aimed at stopped search earlier on failure.
                # => Try to re-raise the most relevant error (if there are more than one)
                reraise_most_important(
                    (future_result for future_result in future_results if future_result.is_finished()),
                    importance=[Exception, SchedulerHardInterrupted, SchedulerSoftInterrupted])

            # Wait for all futures to complete
            # The following call is blocking on all futures until:
            # - Result available
            # - Result interrupted by user or timeout or threshold (SchedulerSoftInterrupted, will be caught)
            # - Result interrupted by error (SchedulerHardInterrupted, will bubble up)
            # - Result failed (any other exception, will bubble up)
            # => Try to re-raise the most relevant error if there are more than one
            reraise_most_important(future_results,
                                   importance=[Exception, SchedulerHardInterrupted, SchedulerSoftInterrupted])

        except SchedulerSoftInterrupted:
            # Search has been cleanly interrupted (user, timeout, max iter)
            interrupted_while_scheduling = True

        batch_results = []
        interrupted_while_computing = False
        for future_result in future_results:
            try:
                batch_results.append(future_result.result())
            except SchedulerSoftInterrupted:
                # Search has been cleanly interrupted after this point (user, timeout, max iter)
                # => Ignore subsequent points (even if they were computed) in order to expose a deterministic behavior
                interrupted_while_computing = True
                break

        has_been_interrupted = interrupted_while_scheduling or interrupted_while_computing
        return batch_results, has_been_interrupted


# Deduplicate an iterable
# - Do not rely on hash and compare each item with every other in 'seen_items'
# - Stop iteration once 'limit' duplicates have been found (to avoid infinite loop)
def deduplicate_iterable(iterable, seen_items=None, limit=None):
    seen_items = [] if seen_items is None else seen_items
    for item in iterable:
        if item not in seen_items:
            seen_items.append(item)
            yield item
        elif limit is not None:
            limit -= 1
            if limit <= 0:
                break
