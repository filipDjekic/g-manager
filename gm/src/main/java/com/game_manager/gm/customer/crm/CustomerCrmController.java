package com.game_manager.gm.customer.crm;import com.game_manager.gm.customer.crm.dto.*;import jakarta.validation.Valid;import java.util.UUID;import lombok.RequiredArgsConstructor;import org.springframework.http.*;import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/v1/customers/{customerId}/crm") @RequiredArgsConstructor
public class CustomerCrmController {private final CustomerCrmService service;
 @GetMapping public CustomerCrmResponse get(@PathVariable UUID customerId,@RequestParam(required=false)String search){return service.get(customerId,search);}
 @PostMapping("/notes") public ResponseEntity<CrmNoteResponse> addNote(@PathVariable UUID customerId,@Valid @RequestBody CrmNoteRequest request){return ResponseEntity.status(HttpStatus.CREATED).body(service.addNote(customerId,request));}
 @PutMapping("/notes/{noteId}") public CrmNoteResponse updateNote(@PathVariable UUID customerId,@PathVariable UUID noteId,@Valid @RequestBody CrmNoteRequest request){return service.updateNote(customerId,noteId,request);}
 @DeleteMapping("/notes/{noteId}") @ResponseStatus(HttpStatus.NO_CONTENT) public void deleteNote(@PathVariable UUID customerId,@PathVariable UUID noteId,@RequestParam long version){service.deleteNote(customerId,noteId,version);}
 @PostMapping("/tags") public CustomerCrmResponse addTag(@PathVariable UUID customerId,@Valid @RequestBody CrmTagRequest request){return service.addTag(customerId,request);}
 @DeleteMapping("/tags/{name}") public CustomerCrmResponse removeTag(@PathVariable UUID customerId,@PathVariable String name,@RequestParam long version){return service.removeTag(customerId,name,version);}}
