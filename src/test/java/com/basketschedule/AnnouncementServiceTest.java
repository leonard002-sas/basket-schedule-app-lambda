package com.basketschedule;

import static org.junit.jupiter.api.Assertions.assertThrows;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

/** お知らせの入力検証が不正な値をDynamoDBアクセス前に拒否することを確認します。 */
class AnnouncementServiceTest {

  private final AnnouncementService service = new AnnouncementService(null);
  private final ObjectMapper mapper = new ObjectMapper();

  @Test
  void rejectsMissingRequiredFieldsBeforeUsingDynamoDb() throws Exception {
    assertThrows(IllegalArgumentException.class, () -> service.save(mapper.readTree("{}")));
    assertThrows(IllegalArgumentException.class, () -> service.save(null));
    assertThrows(IllegalArgumentException.class, () -> service.delete(" "));
  }

  @Test
  void rejectsInvalidUrgencyAndExpiryBeforeUsingDynamoDb() throws Exception {
    assertThrows(
        IllegalArgumentException.class,
        () ->
            service.save(
                mapper.readTree(
                    """
                        {"title":"Practice update","content":"Moved","urgency":"CRITICAL","visibleUntil":"2026-10-01"}
                        """)));
    assertThrows(
        IllegalArgumentException.class,
        () ->
            service.save(
                mapper.readTree(
                    """
                        {"title":"Practice update","content":"Moved","urgency":"NORMAL","visibleUntil":"next week"}
                        """)));
  }
}
