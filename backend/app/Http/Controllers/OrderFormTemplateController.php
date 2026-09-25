<?php

namespace App\Http\Controllers;

use App\Models\OrderFormTemplate;
use App\Support\OrderFormSpec;
use Illuminate\Http\Request;
use InvalidArgumentException;

/**
 * Settings > Order forms. The owner writes the questions the shop asks before it quotes.
 *
 * Nothing here touches a form that has already been sent: a sent form carries its own copy of the
 * questions, so a customer halfway through filling one in never sees it change under them.
 */
class OrderFormTemplateController extends Controller
{
    /**
     * Every template, with the question types the editor can offer and the limits it must keep to.
     * The first call on a shop that has none creates the starter form, so the owner has something
     * to edit rather than a blank page, and so the chat always has a form to send.
     */
    public function index(Request $request)
    {
        try {
            $list = OrderFormTemplate::orderBy('createdAt', 'asc')->get();
            if ($list->isEmpty()) {
                $t = OrderFormSpec::sanitizeTemplate(OrderFormSpec::starter());
                OrderFormTemplate::create($t + ['isDefault' => true, 'createdBy' => (string) ($request->user()->_id ?? '')]);
                $list = OrderFormTemplate::orderBy('createdAt', 'asc')->get();
            }
            return $this->successResponse('Order forms retrieved.', [
                'templates' => $list,
                // The shop's standard form, as the code has it today. It is only SEEDED into an
                // empty list, so a shop whose list was seeded from an older starter never saw the
                // new one - changing starter() changed nothing for them. Sent along so the page can
                // offer it as a draft the owner looks at and saves, rather than it being written
                // over their forms from here.
                'starter'   => OrderFormSpec::sanitizeTemplate(OrderFormSpec::starter()),
                'types'     => OrderFormSpec::types(),
                'limits'    => [
                    'templates'   => OrderFormSpec::MAX_TEMPLATES,
                    'questions'   => OrderFormSpec::MAX_QUESTIONS,
                    'name'        => OrderFormSpec::MAX_NAME,
                    'description' => OrderFormSpec::MAX_DESCRIPTION,
                    'label'       => OrderFormSpec::MAX_LABEL,
                    'help'        => OrderFormSpec::MAX_HELP,
                    'options'     => OrderFormSpec::MAX_OPTIONS,
                    'option'      => OrderFormSpec::MAX_OPTION,
                    'items'       => OrderFormSpec::MAX_ITEMS,
                ],
            ]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Could not load the order forms.');
        }
    }

    public function store(Request $request)
    {
        try {
            if (OrderFormTemplate::count() >= OrderFormSpec::MAX_TEMPLATES) {
                return response()->json(['message' => 'You already have ' . OrderFormSpec::MAX_TEMPLATES . ' forms. Delete one first.'], 422);
            }
            $clean = OrderFormSpec::sanitizeTemplate($request->all());
            $first = OrderFormTemplate::count() === 0;
            $t = OrderFormTemplate::create($clean + [
                'isDefault' => $first || (bool) $request->input('isDefault'),
                'createdBy' => (string) ($request->user()->_id ?? ''),
            ]);
            if ($t->isDefault) $this->clearOtherDefaults((string) $t->_id);
            return $this->successResponse('Order form saved.', $t);
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Could not save the order form.');
        }
    }

    public function update(Request $request, $id)
    {
        try {
            $t = OrderFormTemplate::find($id);
            if (!$t) return $this->notFoundResponse('Order form');
            $clean = OrderFormSpec::sanitizeTemplate($request->all());
            $t->fill($clean + ['updatedBy' => (string) ($request->user()->_id ?? '')]);
            if ($request->has('isDefault') && $request->boolean('isDefault')) $t->isDefault = true;
            $t->save();
            if ($t->isDefault) $this->clearOtherDefaults((string) $t->_id);
            return $this->successResponse('Order form saved.', $t);
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Could not save the order form.');
        }
    }

    public function destroy(Request $request, $id)
    {
        try {
            $t = OrderFormTemplate::find($id);
            if (!$t) return $this->notFoundResponse('Order form');
            if (OrderFormTemplate::count() <= 1) {
                return response()->json(['message' => 'This is the only order form. Edit it instead of deleting it.'], 422);
            }
            $wasDefault = (bool) $t->isDefault;
            $t->delete();
            // The chat sends the default when nobody picks one, so one always has to hold the flag.
            if ($wasDefault) {
                $next = OrderFormTemplate::orderBy('createdAt', 'asc')->first();
                if ($next) { $next->isDefault = true; $next->save(); }
            }
            return $this->successResponse('Order form deleted. Forms already sent are unchanged.');
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Could not delete the order form.');
        }
    }

    private function clearOtherDefaults(string $keepId): void
    {
        foreach (OrderFormTemplate::where('isDefault', true)->get() as $other) {
            if ((string) $other->_id === $keepId) continue;
            $other->isDefault = false;
            $other->save();
        }
    }
}
