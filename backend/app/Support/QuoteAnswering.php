<?php

namespace App\Support;

/**
 * Which waiting requests a quotation actually answers.
 *
 * This used to be "all of them": sending one quotation closed every request the customer had
 * open. A shop quoting the shirts closed the request for the mugs at the same time - silently,
 * and recorded as cancelled, so it left the waiting list and nobody was told.
 *
 * The rule now:
 *
 *   A filled-in order form is a specific job. It says what, how many, what colour, where the
 *   print goes - and it carries the customer's agreement. It is answered only by a quotation
 *   that attached it.
 *
 *   A plain inquiry ("how much for 30 shirts?") carries no such claim. Any quotation to that
 *   customer is the reply to it, which is how it has always worked.
 */
final class QuoteAnswering
{
    /**
     * @param  array<int, array{id: string, fromForm: bool}>  $waiting  the customer's open asks
     * @param  array<int, string>  $attachedAskIds  the forms this quotation was sent against
     * @return array<int, string>  the asks this quotation answers, in the order given
     */
    public static function toClose(array $waiting, array $attachedAskIds): array
    {
        $attached = array_map('strval', $attachedAskIds);
        $out      = [];
        foreach ($waiting as $ask) {
            $id = (string) ($ask['id'] ?? '');
            if ($id === '') continue;
            $fromForm = (bool) ($ask['fromForm'] ?? false);
            if (!$fromForm || in_array($id, $attached, true)) {
                $out[] = $id;
            }
        }
        return $out;
    }
}
